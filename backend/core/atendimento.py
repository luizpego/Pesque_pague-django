"""Regras transacionais do atendimento, compartilhadas com os endpoints legados."""
import hashlib
import json
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from .models import Comanda, EventoComanda, ImpressaoDocumento, Pagamento, Pedido, RequisicaoIdempotente, SessaoCaixa
from . import estoque


class Conflito(APIException):
    status_code = 409
    default_detail = "Esta comanda foi alterada por outra pessoa. Atualize e tente novamente."


def permitir(usuario, papeis):
    if not usuario.is_authenticated or not (usuario.is_superuser or usuario.papel in papeis):
        raise PermissionDenied("Seu perfil não pode executar esta operação.")


def aberta(comanda):
    if comanda.status in {Comanda.Status.FECHADA, Comanda.Status.CANCELADA}:
        raise ValidationError("Esta comanda está finalizada e não pode ser alterada.")


def conferir_versao(comanda, versao):
    if comanda.versao != versao:
        raise Conflito()


def evento(comanda, usuario, acao, dados=None):
    EventoComanda.objects.create(
        comanda=comanda, usuario=usuario, usuario_nome=usuario.username,
        acao=acao, dados=json.loads(json.dumps(dados or {}, default=str)),
    )
    comanda.versao += 1
    comanda.save(update_fields=["versao", "atualizada_em"])
    comanda._prefetched_objects_cache = {}


def idempotencia(usuario, operacao, chave, dados):
    if not chave or len(chave) > 64:
        raise ValidationError("Envie uma chave de operação entre 1 e 64 caracteres.")
    assinatura = hashlib.sha256(json.dumps(dados, sort_keys=True, default=str).encode()).hexdigest()
    anterior = RequisicaoIdempotente.objects.filter(usuario=usuario, operacao=operacao, chave=chave).first()
    if anterior and anterior.assinatura != assinatura:
        raise Conflito("Esta chave já foi usada com outros dados.")
    return anterior, assinatura


def registrar_chave(usuario, operacao, chave, assinatura, resultado_id):
    RequisicaoIdempotente.objects.create(
        usuario=usuario, operacao=operacao, chave=chave, assinatura=assinatura, resultado_id=resultado_id,
    )


def enviar_rascunho(comanda, usuario):
    itens = list(comanda.itens.filter(pedido__isnull=True, cancelado=False))
    if not itens:
        raise ValidationError("Adicione itens antes de enviar o pedido.")
    pedido = Pedido.objects.create(comanda=comanda, responsavel=usuario)
    for item in itens:
        item.pedido = pedido
        item.save(update_fields=["pedido", "atualizado_em"])
    estoque.confirmar(itens, usuario)
    preparar_impressao(pedido, usuario)
    evento(comanda, usuario, "pedido_recebido", {"pedido": pedido.id, "itens": [i.id for i in itens]})
    return pedido


def preparar_impressao(pedido, usuario):
    return ImpressaoDocumento.objects.get_or_create(pedido=pedido, defaults={
        "comanda": pedido.comanda, "tipo_documento": "cozinha", "status": "pendente", "gerado_por": usuario,
    })[0]


def cancelar_comanda(comanda, usuario, motivo):
    aberta(comanda)
    if comanda.pago or comanda.pagamentos.filter(status=Pagamento.Status.APROVADO).exists():
        raise ValidationError("Há pagamento confirmado. O cancelamento exige estorno prévio.")
    comanda.status = Comanda.Status.CANCELADA
    comanda.motivo_cancelamento = motivo
    comanda.cancelada_por = usuario
    comanda.cancelada_em = timezone.now()
    comanda.save(update_fields=["status", "motivo_cancelamento", "cancelada_por", "cancelada_em"])
    comanda.pedidos.exclude(status=Pedido.Status.CANCELADO).update(
        status=Pedido.Status.CANCELADO, motivo_cancelamento=motivo, cancelado_em=timezone.now(),
    )
    estoque.cancelar_itens(list(comanda.itens.filter(cancelado=False).select_related("pedido")), usuario, motivo)
    evento(comanda, usuario, "comanda_cancelada", {"motivo": motivo})


def resumo_caixa(comanda, dados):
    subtotal = comanda.subtotal
    desconto, acrescimo = Decimal(dados["desconto"]), Decimal(dados["acrescimo"])
    total = subtotal + acrescimo - desconto
    if total < 0 or total > Decimal("9999999999.99"):
        raise ValidationError("Desconto ou acréscimo resulta em um total inválido.")
    recebido = sum((p.valor for p in comanda.pagamentos.filter(status=Pagamento.Status.APROVADO)), Decimal("0.00"))
    if recebido > total:
        raise ValidationError("O valor já recebido supera o total. É necessário tratar o estorno.")
    return {"subtotal": subtotal, "desconto": desconto, "acrescimo": acrescimo,
            "total": total, "recebido": recebido, "restante": total - recebido}


def fechar(comanda, usuario, dados):
    aberta(comanda)
    caixa = SessaoCaixa.objects.select_for_update().filter(fechada_em__isnull=True).first()
    if not caixa:
        raise ValidationError("Abra o caixa antes de receber pagamentos.")
    if not comanda.itens.filter(cancelado=False).exists():
        raise ValidationError("Não é possível fechar uma comanda sem itens.")
    if comanda.itens.filter(cancelado=False, pedido__isnull=True).exists():
        raise ValidationError("Envie os itens pendentes antes do fechamento.")
    if comanda.pedidos.exclude(status__in=[Pedido.Status.ENTREGUE, Pedido.Status.CANCELADO]).exists():
        raise ValidationError("Entregue ou cancele os pedidos pendentes antes de fechar.")
    resumo = resumo_caixa(comanda, dados)
    parcelas = sum((p["valor"] for p in dados["pagamentos"]), Decimal("0.00"))
    if parcelas != resumo["restante"]:
        raise ValidationError({"pagamentos": f"Informe exatamente R$ {resumo['restante']:.2f} em pagamentos."})
    for parcela in dados["pagamentos"]:
        Pagamento.objects.create(
            comanda=comanda, forma=parcela["forma"], valor=parcela["valor"],
            origem="manual", registrado_por=usuario, status=Pagamento.Status.APROVADO,
            caixa=caixa,
        )
    comanda.desconto = resumo["desconto"]
    comanda.acrescimo = resumo["acrescimo"]
    comanda.subtotal_fechamento = resumo["subtotal"]
    comanda.total_fechamento = resumo["total"]
    comanda.fechada_por = usuario
    comanda.fechada_em = timezone.now()
    comanda.pago = True
    comanda.pago_em = comanda.pago_em or comanda.fechada_em
    comanda.status = Comanda.Status.FECHADA
    comanda.save()
    evento(comanda, usuario, "fechamento", {**resumo, "pagamentos": dados["pagamentos"]})
    return resumo
