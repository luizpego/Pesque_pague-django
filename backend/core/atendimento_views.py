from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from . import atendimento as regras
from . import estoque
from .atendimento_serializers import (
    AberturaSerializer, AlterarItemSerializer, AtendimentoResumoSerializer, AtendimentoSerializer,
    CancelarSerializer, FechamentoSerializer, NovoPedidoSerializer, StatusPedidoSerializer, VersaoSerializer,
    PedidoSerializer,
)
from .models import Comanda, ConfiguracaoEstabelecimento, EventoComanda, ItemCardapio, ItemComanda, Mesa, Pagamento, Pedido

Usuario = get_user_model()
ATENDENTES = {"garcom", "gerente"}
CAIXAS = {"caixa", "gerente"}


def validar(classe, data):
    serializer = classe(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def periodo(params):
    hoje = timezone.localdate()
    preset = params.get("periodo")
    if preset in {"hoje", "ontem"}:
        inicio = fim = hoje - timedelta(days=1 if preset == "ontem" else 0)
    elif preset == "semana":
        inicio, fim = hoje - timedelta(days=hoje.weekday()), hoje
    elif preset == "mes":
        inicio, fim = hoje.replace(day=1), hoje
    else:
        try:
            inicio = datetime.strptime(params.get("inicio") or hoje.isoformat(), "%Y-%m-%d").date()
            fim = datetime.strptime(params.get("fim") or inicio.isoformat(), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            raise ValidationError("Use datas no formato AAAA-MM-DD.")
    if fim < inicio or (fim - inicio).days > 366:
        raise ValidationError("Informe um período de até 366 dias, com início anterior ao fim.")
    return (timezone.make_aware(datetime.combine(inicio, time.min)),
            timezone.make_aware(datetime.combine(fim + timedelta(days=1), time.min)))


def inteiro_filtro(params, nome):
    valor = params.get(nome)
    if not valor:
        return None
    try:
        valor = int(valor)
        if not 1 <= valor <= 9223372036854775807:
            raise ValueError
        return valor
    except (ValueError, TypeError):
        raise ValidationError({nome: "Informe um identificador válido."})


class AtendimentoViewSet(viewsets.GenericViewSet):
    lookup_value_regex = "[0-9]{1,18}"
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AtendimentoSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        user = request.user
        if not user.is_superuser and user.papel == "cozinha" and self.action not in {"fila", "status_pedido", "impressao", "confirmar_impressao", "configuracao_impressao"}:
            raise PermissionDenied("Use a fila da cozinha.")

    def get_queryset(self):
        qs = Comanda.objects.select_related("mesa", "cliente", "responsavel", "fechada_por").prefetch_related(
            "itens__criado_por", "pagamentos__registrado_por",
        ).order_by("-criada_em", "-id")
        if self.action == "list":
            qs = qs.prefetch_related("pedidos")
        else:
            qs = qs.prefetch_related("pedidos__responsavel", "pedidos__impressao", "pedidos__itens__criado_por", "eventos")
        if not (self.request.user.is_superuser or self.request.user.is_staff_operacional):
            qs = qs.filter(cliente=self.request.user)
        return qs

    def bloquear(self):
        if not settings.ORDERS_ENABLED:
            raise PermissionDenied("O atendimento está desativado.")
        qs = Comanda.objects.select_for_update()
        if not (self.request.user.is_superuser or self.request.user.is_staff_operacional):
            qs = qs.filter(cliente=self.request.user)
        return get_object_or_404(qs, pk=self.kwargs["pk"])

    def resposta(self, pk, status=200):
        dados = AtendimentoSerializer(self.get_queryset().get(pk=pk)).data
        if self.request.user.papel == "cliente" and not self.request.user.is_superuser:
            dados["eventos"] = []
        if self.request.user.papel == "cozinha" and not self.request.user.is_superuser:
            return Response({"id": pk, "versao": dados["versao"]}, status=status)
        return Response(dados, status=status)

    def list(self, request):
        qs = self.get_queryset()
        status = request.query_params.get("status", "ativas")
        if status == "ativas":
            qs = qs.exclude(status__in=["fechada", "cancelada"])
        elif status and status != "todas":
            if status not in Comanda.Status.values:
                raise ValidationError({"status": "Status inválido."})
            qs = qs.filter(status=status)
        busca = request.query_params.get("busca", "").strip()
        if busca:
            filtro = Q(identificacao__icontains=busca) | Q(cliente__username__icontains=busca)
            if busca.isdecimal() and len(busca) <= 18:
                filtro |= Q(pk=int(busca)) | Q(mesa__numero=int(busca))
            qs = qs.filter(filtro)
        funcionario = inteiro_filtro(request.query_params, "funcionario")
        produto = inteiro_filtro(request.query_params, "produto")
        if funcionario:
            qs = qs.filter(responsavel_id=funcionario)
        if produto:
            qs = qs.filter(itens__item_cardapio_id=produto).distinct()
        if any(request.query_params.get(c) for c in ("inicio", "fim", "periodo")):
            inicio, fim = periodo(request.query_params)
            qs = qs.filter(criada_em__gte=inicio, criada_em__lt=fim)
        pagina = self.paginate_queryset(qs)
        return self.get_paginated_response(AtendimentoResumoSerializer(pagina, many=True).data)

    def retrieve(self, request, pk=None):
        return self.resposta(self.get_object().pk)

    @transaction.atomic
    def create(self, request):
        regras.permitir(request.user, ATENDENTES | {"cliente"})
        if not settings.ORDERS_ENABLED:
            raise PermissionDenied("O atendimento está desativado.")
        dados = validar(AberturaSerializer, request.data)
        Usuario.objects.select_for_update().get(pk=request.user.pk)
        chave = request.headers.get("Idempotency-Key")
        anterior, assinatura = regras.idempotencia(request.user, "abrir_atendimento", chave, dados)
        if anterior:
            return self.resposta(anterior.resultado_id)
        mesa = None
        if dados.get("mesa"):
            mesa = get_object_or_404(Mesa.objects.select_for_update(), pk=dados["mesa"])
            if not mesa.ativa:
                raise ValidationError("Esta mesa está inativa.")
        try:
            with transaction.atomic():
                comanda = Comanda.objects.create(
                    mesa=mesa, identificacao=dados["identificacao"], observacoes=dados["observacoes"],
                    responsavel=request.user,
                    cliente=request.user if request.user.papel == "cliente" and not request.user.is_superuser else None,
                )
        except IntegrityError:
            raise regras.Conflito("Você já tem uma comanda aberta. Acesse-a para continuar.")
        regras.evento(comanda, request.user, "abertura", dados)
        regras.registrar_chave(request.user, "abrir_atendimento", chave, assinatura, comanda.id)
        return self.resposta(comanda.id, 201)

    @action(detail=False, methods=["get"])
    def opcoes(self, request):
        produtos = list(ItemCardapio.objects.filter(disponivel=True).filter(
            Q(controla_estoque=False) | Q(estoque_atual__gt=0)).values("id", "nome", "preco", "unidade", "imagem"))
        mesas = list(Mesa.objects.filter(ativa=True).values("id", "numero", "localizacao"))
        ocupadas = {c["mesa_id"]: c["n"] for c in Comanda.objects.exclude(status__in=["fechada", "cancelada"]).values("mesa_id").annotate(n=Count("id"))}
        for mesa in mesas:
            mesa["ocupada"] = mesa["id"] in ocupadas
            mesa["comandas_abertas"] = ocupadas.get(mesa["id"], 0)
        funcionarios = list(Usuario.objects.filter(
            Q(papel__in=["garcom", "caixa", "cozinha", "gerente"]) | Q(is_superuser=True),
        ).values("id", "username"))
        if request.user.papel == "cliente" and not request.user.is_superuser:
            funcionarios = []
        return Response({"produtos": produtos, "todos_produtos": list(ItemCardapio.objects.values("id", "nome")) if funcionarios else [],
                         "mesas": mesas, "funcionarios": funcionarios,
                         "formas_pagamento": [{"id": k, "nome": v} for k, v in Pagamento.Forma.choices]})

    @action(detail=False, methods=["get"])
    def fila(self, request):
        regras.permitir(request.user, {"garcom", "cozinha", "gerente", "caixa"})
        qs = Pedido.objects.exclude(comanda__status__in=["fechada", "cancelada"]).select_related(
            "comanda__mesa", "responsavel", "impressao",
        ).prefetch_related("itens__criado_por").order_by("criado_em", "id")
        status = request.query_params.get("status")
        if status:
            if status not in Pedido.Status.values:
                raise ValidationError("Status de pedido inválido.")
            qs = qs.filter(status=status)
        else:
            qs = qs.exclude(status__in=["entregue", "cancelado"])
        pagina = self.paginate_queryset(qs)
        dados = []
        for pedido in pagina:
            registro = PedidoSerializer(pedido).data
            if request.user.papel == "cozinha" and not request.user.is_superuser:
                for item in registro["itens"]:
                    item.pop("preco_unitario", None)
                    item.pop("subtotal", None)
            dados.append({**registro, "comanda": {
                "id": pedido.comanda_id, "versao": pedido.comanda.versao,
                "mesa_numero": pedido.comanda.mesa.numero if pedido.comanda.mesa else None,
                "identificacao": pedido.comanda.identificacao,
            }})
        return self.get_paginated_response(dados)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def pedidos(self, request, pk=None):
        regras.permitir(request.user, ATENDENTES | {"cliente"})
        dados = validar(NovoPedidoSerializer, request.data)
        comanda = self.bloquear()
        chave = request.headers.get("Idempotency-Key")
        operacao = f"novo_pedido:{comanda.id}"
        anterior, assinatura = regras.idempotencia(request.user, operacao, chave, dados)
        if anterior:
            return self.resposta(comanda.id)
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        if comanda.status == Comanda.Status.AGUARDANDO or comanda.pago:
            raise ValidationError("Esta comanda já está no caixa.")
        produtos = {p.pk: p for p in ItemCardapio.objects.select_for_update().filter(
            pk__in=[i["item_cardapio"] for i in dados["itens"]]).order_by("pk")}
        for item in dados["itens"]:
            produto = produtos.get(item["item_cardapio"])
            if not produto or not produto.disponivel:
                raise ValidationError("Um produto não existe ou está indisponível. Atualize o catálogo.")
        pedido = Pedido.objects.create(comanda=comanda, responsavel=request.user)
        for item in dados["itens"]:
            produto = produtos[item["item_cardapio"]]
            ItemComanda.objects.create(
                comanda=comanda, pedido=pedido, item_cardapio=produto, nome_registrado=produto.nome,
                quantidade=item["quantidade"], preco_unitario=produto.preco,
                observacoes=item["observacoes"], criado_por=request.user,
            )
        estoque.confirmar(list(pedido.itens.all()), request.user)
        if comanda.subtotal > Decimal("9999999999.99"):
            raise ValidationError("O consumo ultrapassa o limite desta comanda.")
        regras.preparar_impressao(pedido, request.user)
        comanda.status = Comanda.Status.ATENDIMENTO
        comanda.save(update_fields=["status"])
        regras.evento(comanda, request.user, "pedido_recebido", {
            "pedido": pedido.id, "itens": list(pedido.itens.values(
                "id", "nome_registrado", "quantidade", "preco_unitario", "observacoes",
            )),
        })
        regras.registrar_chave(request.user, operacao, chave, assinatura, pedido.id)
        return self.resposta(comanda.id, 201)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def enviar_carrinho(self, request, pk=None):
        regras.permitir(request.user, ATENDENTES | {"cliente"})
        dados = validar(VersaoSerializer, request.data)
        comanda = self.bloquear()
        chave = request.headers.get("Idempotency-Key")
        operacao = f"enviar_carrinho:{comanda.id}"
        anterior, assinatura = regras.idempotencia(request.user, operacao, chave, dados)
        if anterior:
            return self.resposta(comanda.id)
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        if comanda.pago or comanda.status == Comanda.Status.AGUARDANDO:
            raise ValidationError("Esta comanda já está no caixa.")
        regras.enviar_rascunho(comanda, request.user)
        comanda.status = Comanda.Status.ATENDIMENTO
        comanda.save(update_fields=["status"])
        regras.registrar_chave(request.user, operacao, chave, assinatura, comanda.id)
        return self.resposta(comanda.id)

    @action(detail=True, methods=["patch"], url_path=r"itens/(?P<item_id>[0-9]+)")
    @transaction.atomic
    def alterar_item(self, request, pk=None, item_id=None):
        regras.permitir(request.user, ATENDENTES | {"cliente"})
        dados = validar(AlterarItemSerializer, request.data)
        comanda = self.bloquear()
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        item = get_object_or_404(ItemComanda, pk=item_id, comanda=comanda, cancelado=False)
        if comanda.pago or comanda.status == Comanda.Status.AGUARDANDO or (item.pedido and item.pedido.status != Pedido.Status.RECEBIDO):
            raise ValidationError("O item só pode ser editado antes do preparo e do pagamento.")
        antes = {"quantidade": item.quantidade, "observacoes": item.observacoes}
        estoque.alterar(item, dados["quantidade"], request.user)
        item.quantidade, item.observacoes = dados["quantidade"], dados["observacoes"]
        item.save(update_fields=["quantidade", "observacoes", "atualizado_em"])
        regras.evento(comanda, request.user, "item_alterado", {"item": item.id, "antes": antes, "depois": dados})
        return self.resposta(comanda.id)

    @action(detail=True, methods=["post"], url_path=r"itens/(?P<item_id>[0-9]+)/cancelar")
    @transaction.atomic
    def cancelar_item(self, request, pk=None, item_id=None):
        regras.permitir(request.user, ATENDENTES | {"cliente"})
        dados = validar(CancelarSerializer, request.data)
        comanda = self.bloquear()
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        if comanda.pago or comanda.status == Comanda.Status.AGUARDANDO:
            raise ValidationError("A comanda já está no caixa.")
        item = get_object_or_404(ItemComanda, pk=item_id, comanda=comanda, cancelado=False)
        if request.user.papel == "cliente" and not request.user.is_superuser and item.pedido and item.pedido.status != "recebido":
            raise PermissionDenied("O preparo já começou. Solicite o cancelamento ao atendente.")
        estoque.cancelar_itens([item], request.user, dados["motivo"])
        if item.pedido and not item.pedido.itens.filter(cancelado=False).exists():
            item.pedido.status = Pedido.Status.CANCELADO
            item.pedido.motivo_cancelamento = dados["motivo"]
            item.pedido.cancelado_em = timezone.now()
            item.pedido.save()
        regras.evento(comanda, request.user, "item_cancelado", {"item": item.id, "motivo": dados["motivo"]})
        return self.resposta(comanda.id)

    @action(detail=True, methods=["post"], url_path=r"pedidos/(?P<pedido_id>[0-9]+)/status")
    @transaction.atomic
    def status_pedido(self, request, pk=None, pedido_id=None):
        dados = validar(StatusPedidoSerializer, request.data)
        comanda = self.bloquear()
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        pedido = get_object_or_404(Pedido, pk=pedido_id, comanda=comanda)
        destino = dados["status"]
        if destino == Pedido.Status.CANCELADO:
            regras.permitir(request.user, ATENDENTES | {"cliente"})
            if request.user.papel == "cliente" and not request.user.is_superuser and pedido.status != "recebido":
                raise PermissionDenied("O preparo já começou. Solicite o cancelamento ao atendente.")
            if not dados.get("motivo"):
                raise ValidationError("Informe o motivo do cancelamento.")
            if comanda.pago or comanda.status == Comanda.Status.AGUARDANDO or pedido.status == destino:
                raise ValidationError("Este pedido não pode ser cancelado.")
            pedido.cancelado_em, pedido.motivo_cancelamento = timezone.now(), dados["motivo"]
            estoque.cancelar_itens(list(pedido.itens.all()), request.user, dados["motivo"])
        else:
            regras.permitir(request.user, {"cozinha", "gerente"} if destino in {"preparando", "pronto"} else ATENDENTES | {"cozinha"})
            if {"recebido": "preparando", "preparando": "pronto", "pronto": "entregue"}.get(pedido.status) != destino:
                raise ValidationError("Mudança de status inválida.")
        anterior = pedido.status
        pedido.status = destino
        pedido.save()
        regras.evento(comanda, request.user, "pedido_status", {
            "pedido": pedido.id, "antes": anterior, "depois": destino, "motivo": dados.get("motivo", ""),
        })
        return self.resposta(comanda.id)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def aguardar_pagamento(self, request, pk=None):
        regras.permitir(request.user, ATENDENTES | CAIXAS | {"cliente"})
        dados = validar(VersaoSerializer, request.data)
        comanda = self.bloquear()
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        if not comanda.itens.filter(cancelado=False).exists() or comanda.itens.filter(cancelado=False, pedido__isnull=True).exists():
            raise ValidationError("Envie os itens antes de encaminhar ao caixa.")
        if comanda.pedidos.exclude(status__in=["entregue", "cancelado"]).exists():
            raise ValidationError("Ainda há pedidos pendentes de entrega.")
        comanda.status = Comanda.Status.AGUARDANDO
        comanda.save(update_fields=["status"])
        regras.evento(comanda, request.user, "aguardando_pagamento")
        return self.resposta(comanda.id)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def previa_fechamento(self, request, pk=None):
        regras.permitir(request.user, CAIXAS)
        dados = validar(FechamentoSerializer, request.data)
        comanda = self.bloquear()
        regras.aberta(comanda)
        regras.conferir_versao(comanda, dados["versao"])
        return Response({k: str(v) for k, v in regras.resumo_caixa(comanda, dados).items()})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def fechar(self, request, pk=None):
        regras.permitir(request.user, CAIXAS)
        dados = validar(FechamentoSerializer, request.data)
        comanda = self.bloquear()
        chave = request.headers.get("Idempotency-Key")
        operacao = f"fechar:{comanda.id}"
        anterior, assinatura = regras.idempotencia(request.user, operacao, chave, dados)
        if anterior:
            return self.resposta(comanda.id)
        regras.conferir_versao(comanda, dados["versao"])
        regras.fechar(comanda, request.user, dados)
        regras.registrar_chave(request.user, operacao, chave, assinatura, comanda.id)
        return self.resposta(comanda.id)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancelar(self, request, pk=None):
        regras.permitir(request.user, ATENDENTES)
        dados = validar(CancelarSerializer, request.data)
        comanda = self.bloquear()
        regras.conferir_versao(comanda, dados["versao"])
        regras.cancelar_comanda(comanda, request.user, dados["motivo"])
        return self.resposta(comanda.id)

    @action(detail=True, methods=["get", "post"])
    @transaction.atomic
    def impressao(self, request, pk=None):
        comanda = self.bloquear()
        pedido_id = inteiro_filtro(request.query_params if request.method == "GET" else request.data, "pedido")
        if request.user.papel == "cozinha" and not request.user.is_superuser and not pedido_id:
            raise PermissionDenied("A cozinha só pode imprimir pedidos sem valores.")
        documento = AtendimentoSerializer(self.get_queryset().get(pk=pk)).data
        config = ConfiguracaoEstabelecimento.objects.first()
        documento["estabelecimento_nome"] = config.nome if config else "Pesque & Pague"
        if pedido_id:
            pedido = get_object_or_404(Pedido, pk=pedido_id, comanda=comanda)
            documento["pedidos"] = [p for p in documento["pedidos"] if p["id"] == pedido.id]
            documento["itens"] = [i for i in documento["itens"] if i["pedido"] == pedido.id]
            for item in documento["itens"]:
                for campo in ("subtotal", "preco_unitario"):
                    item.pop(campo, None)
            for p in documento["pedidos"]:
                for item in p["itens"]:
                    for campo in ("subtotal", "preco_unitario"):
                        item.pop(campo, None)
            for campo in ("subtotal", "total", "desconto", "acrescimo", "pagamentos", "eventos"):
                documento.pop(campo, None)
        # A auditoria guarda o conteúdo enviado à impressão, sem mudar a versão da venda.
        documento.pop("eventos", None)
        if request.method == "POST":
            if pedido_id:
                impressao = regras.preparar_impressao(pedido, request.user)
                impressao.quantidade_solicitacoes += 1
                impressao.ultima_solicitacao_em = timezone.now()
                impressao.status = "solicitado"
                impressao.save()
                documento["impressao_id"] = impressao.pk
                documento["tentativa"] = impressao.quantidade_solicitacoes
            EventoComanda.objects.create(
                comanda=comanda, usuario=request.user, usuario_nome=request.user.username,
                acao="impressao_cozinha" if pedido_id else "impressao_comanda", dados=dict(documento),
            )
        return Response(documento)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def confirmar_impressao(self, request, pk=None):
        regras.permitir(request.user, {"cozinha", "garcom", "gerente", "caixa"})
        comanda = self.bloquear()
        pedido = get_object_or_404(Pedido, pk=inteiro_filtro(request.data, "pedido"), comanda=comanda)
        impressao = regras.preparar_impressao(pedido, request.user)
        if inteiro_filtro(request.data, "tentativa") != impressao.quantidade_solicitacoes:
            raise regras.Conflito("Outra impressão foi solicitada. Atualize o pedido.")
        if request.data.get("status") not in {"impresso", "falha"}:
            raise ValidationError("Confirme a impressão ou informe uma falha.")
        impressao.status = request.data["status"]
        if impressao.status == "impresso":
            impressao.status = "reimpresso" if impressao.confirmado_em else "impresso"
            impressao.confirmado_em = timezone.now()
        impressao.detalhe_falha = str(request.data.get("motivo", ""))[:300]
        impressao.save()
        EventoComanda.objects.create(comanda=comanda, usuario=request.user, usuario_nome=request.user.username,
            acao="resultado_impressao", dados={"pedido": pedido.id, "status": impressao.status, "tentativa": impressao.quantidade_solicitacoes, "motivo": impressao.detalhe_falha})
        return Response({"status": impressao.status})

    @action(detail=False, methods=["get"])
    def configuracao_impressao(self, request):
        regras.permitir(request.user, {"cozinha", "garcom", "caixa", "gerente"})
        config = ConfiguracaoEstabelecimento.objects.first()
        return Response({"impressora": config.impressora_cozinha if config else "", "papel": config.papel_cozinha if config else "80mm"})

    @action(detail=True, methods=["get"])
    def dividir(self, request, pk=None):
        comanda = self.get_object()
        pessoas = inteiro_filtro(request.query_params, "pessoas") or 2
        if pessoas > 50:
            raise ValidationError("Divida em até 50 pessoas.")
        recebido = sum((p.valor for p in comanda.pagamentos.all() if p.status == "approved"), Decimal("0"))
        restante = max(Decimal("0"), comanda.total - recebido)
        base, sobra = divmod(int(restante * 100), pessoas)
        return Response({"restante": str(restante), "partes": [str(Decimal(base + (1 if i < sobra else 0)) / 100) for i in range(pessoas)]})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def convite(self, request, pk=None):
        regras.permitir(request.user, ATENDENTES)
        comanda = self.bloquear()
        regras.aberta(comanda)
        if comanda.cliente_id:
            raise ValidationError("Esta comanda já está vinculada a um cliente.")
        comanda.vinculo_token = uuid4()
        comanda.save(update_fields=["vinculo_token"])
        return Response({"token": str(comanda.vinculo_token)})

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def vincular(self, request):
        regras.permitir(request.user, {"cliente"})
        Usuario.objects.select_for_update().get(pk=request.user.pk)
        token = serializers.UUIDField().run_validation(request.data.get("token"))
        comanda = get_object_or_404(Comanda.objects.select_for_update(), vinculo_token=token, cliente__isnull=True)
        regras.aberta(comanda)
        if Comanda.objects.filter(cliente=request.user, status="aberta").exists() and comanda.status == "aberta":
            raise ValidationError("Finalize sua outra comanda aberta antes de vincular esta.")
        comanda.cliente = request.user
        comanda.vinculo_token = None
        comanda.save(update_fields=["cliente", "vinculo_token"])
        regras.evento(comanda, request.user, "cliente_vinculado")
        return self.resposta(comanda.pk)

    @action(detail=False, methods=["get"])
    def relatorio(self, request):
        regras.permitir(request.user, {"gerente"})
        inicio, fim = periodo(request.query_params)
        qs = Comanda.objects.all()
        funcionario = inteiro_filtro(request.query_params, "funcionario")
        produto = inteiro_filtro(request.query_params, "produto")
        status = request.query_params.get("status")
        forma = request.query_params.get("forma")
        if forma:
            if forma not in Pagamento.Forma.values:
                raise ValidationError("Forma de pagamento inválida.")
            qs = qs.filter(pagamentos__forma=forma, pagamentos__status="approved").distinct()
        if funcionario:
            qs = qs.filter(responsavel_id=funcionario)
        if status:
            if status not in Comanda.Status.values:
                raise ValidationError({"status": "Status inválido."})
            qs = qs.filter(status=status)
        if produto:
            qs = qs.filter(itens__item_cardapio_id=produto).distinct()
        criadas = qs.filter(criada_em__gte=inicio, criada_em__lt=fim)
        vendas = qs.filter(status="fechada", pago=True, fechada_em__gte=inicio, fechada_em__lt=fim)
        faturamento = sum((v.total for v in vendas.prefetch_related("itens")), Decimal("0.00"))
        pedidos = Pedido.objects.filter(comanda__in=qs, criado_em__gte=inicio, criado_em__lt=fim)
        if produto:
            pedidos = pedidos.filter(itens__item_cardapio_id=produto).distinct()
        produtos = defaultdict(lambda: {"quantidade": Decimal("0.00"), "valor_bruto": Decimal("0.00")})
        itens = ItemComanda.objects.filter(comanda__in=vendas, cancelado=False).exclude(pedido__status="cancelado")
        if produto:
            itens = itens.filter(item_cardapio_id=produto)
        quantidade = Decimal("0.00")
        for item in itens:
            chave = (item.item_cardapio_id, item.nome_registrado)
            produtos[chave]["quantidade"] += item.quantidade
            produtos[chave]["valor_bruto"] += item.subtotal
            quantidade += item.quantidade
        ranking = sorted(
            [{"id": pk, "nome": nome, **valores} for (pk, nome), valores in produtos.items()],
            key=lambda p: p["quantidade"], reverse=True,
        )
        numero_vendas = vendas.count()
        por_forma = {k: Decimal("0.00") for k in Pagamento.Forma.values}
        for pagamento in Pagamento.objects.filter(comanda__in=vendas, status="approved"):
            por_forma[pagamento.forma] += pagamento.valor
        vendidos_ids = {p["id"] for p in ranking}
        menos_vendidos = [{**p, "quantidade": str(p["quantidade"]), "valor_bruto": str(p["valor_bruto"])} for p in list(reversed(ranking))[:10]]
        sem_vendas = list(ItemCardapio.objects.exclude(pk__in=vendidos_ids).values("id", "nome")[:20])
        return Response({
            "por_forma": {k: str(v) for k, v in por_forma.items()}, "menos_vendidos": menos_vendidos,
            "sem_vendas": sem_vendas,
            "comandas_abertas": criadas.exclude(status__in=["fechada", "cancelada"]).count(),
            "comandas_fechadas": numero_vendas, "quantidade_pedidos": pedidos.count(),
            "pedidos_cancelados": pedidos.filter(status="cancelado").count(),
            "itens_vendidos": str(quantidade), "faturamento": str(faturamento),
            "ticket_medio": str((faturamento / numero_vendas).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if numero_vendas else Decimal("0.00")),
            "produtos": [{**p, "quantidade": str(p["quantidade"]), "valor_bruto": str(p["valor_bruto"])} for p in ranking],
            "criterio": "Faturamento por fechamento; pedidos e comandas abertas por criação no período. Funcionário é o responsável pela abertura. Produto e forma selecionam vendas que os contêm; total inclui a venda inteira. Ranking bruto antes de descontos; quantidades nas unidades do catálogo.",
        })
