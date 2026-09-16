from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


def preservar(apps, schema_editor):
    Comanda = apps.get_model("core", "Comanda")
    Pedido = apps.get_model("core", "Pedido")
    Item = apps.get_model("core", "ItemComanda")
    Evento = apps.get_model("core", "EventoComanda")
    db = schema_editor.connection.alias
    for comanda in Comanda.objects.using(db).all().iterator():
        itens = list(Item.objects.using(db).filter(comanda_id=comanda.id).select_related("item_cardapio"))
        subtotal = Decimal("0.00")
        pedido = None
        if itens and comanda.status != "aberta":
            status = {"enviada": "recebido", "em_preparo": "preparando", "pronta": "pronto",
                      "entregue": "entregue", "fechada": "entregue", "cancelada": "cancelado"}[comanda.status]
            pedido = Pedido.objects.using(db).create(
                comanda_id=comanda.id, status=status, motivo_cancelamento=comanda.motivo_cancelamento,
            )
            Pedido.objects.using(db).filter(pk=pedido.id).update(criado_em=comanda.criada_em)
        for item in itens:
            subtotal += (item.quantidade * item.preco_unitario).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            Item.objects.using(db).filter(pk=item.id).update(
                nome_registrado=item.item_cardapio.nome, pedido_id=pedido.id if pedido else None,
                cancelado=comanda.status == "cancelada", motivo_cancelamento=comanda.motivo_cancelamento,
            )
        if comanda.status == "fechada":
            Comanda.objects.using(db).filter(pk=comanda.id).update(
                subtotal_fechamento=subtotal, total_fechamento=subtotal,
                fechada_em=comanda.atualizada_em,
            )
        Evento.objects.using(db).create(comanda_id=comanda.id, acao="importacao_legada", dados={
            "aviso": "Registro anterior à auditoria. Autor e hora dos itens não estavam disponíveis; data de fechamento inferida da última atualização e nome do catálogo preservado na migração.",
            "status": comanda.status, "subtotal": str(subtotal),
        })


class Migration(migrations.Migration):
    dependencies = [("core", "0006_eventocomanda_pedido_and_more")]
    operations = [migrations.RunPython(preservar, migrations.RunPython.noop)]
