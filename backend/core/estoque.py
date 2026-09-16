"""Baixa somente na confirmação do pedido, sob a transação da comanda."""
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from .models import ItemCardapio, MovimentoEstoque


def movimentar(produto, quantidade, usuario, tipo, motivo, pedido=None):
    novo = produto.estoque_atual + quantidade
    if novo < 0 or novo > Decimal("9999999999.99"):
        raise ValidationError(f"Estoque insuficiente ou quantidade inválida para {produto.nome}.")
    produto.estoque_atual = novo
    produto.save(update_fields=["estoque_atual"])
    MovimentoEstoque.objects.create(produto=produto, quantidade=quantidade, saldo=novo,
        usuario=usuario, tipo=tipo, motivo=motivo, pedido=pedido)


def confirmar(itens, usuario):
    # Ordem fixa de bloqueio evita deadlocks entre pedidos de comandas distintas.
    produtos = {p.pk: p for p in ItemCardapio.objects.select_for_update().filter(
        pk__in={i.item_cardapio_id for i in itens}).order_by("pk")}
    for item in itens:
        produto = produtos[item.item_cardapio_id]
        if not produto.disponivel:
            raise ValidationError(f"{produto.nome} está indisponível.")
        if produto.controla_estoque and not item.estoque_baixado:
            movimentar(produto, -item.quantidade, usuario, "pedido", "Confirmação do pedido", item.pedido)
            item.estoque_baixado = item.quantidade
            item.save(update_fields=["estoque_baixado"])


def devolver(itens, usuario, motivo):
    produtos = {p.pk: p for p in ItemCardapio.objects.select_for_update().filter(
        pk__in={i.item_cardapio_id for i in itens}).order_by("pk")}
    for item in itens:
        if item.estoque_baixado:
            movimentar(produtos[item.item_cardapio_id], item.estoque_baixado, usuario,
                "cancelamento", motivo, item.pedido)
            item.estoque_baixado = Decimal("0")
            item.save(update_fields=["estoque_baixado"])


def alterar(item, quantidade, usuario):
    produto = ItemCardapio.objects.select_for_update().get(pk=item.item_cardapio_id)
    if item.estoque_baixado:
        movimentar(produto, item.estoque_baixado - quantidade, usuario, "alteracao", "Quantidade alterada", item.pedido)
        item.estoque_baixado = quantidade
        item.save(update_fields=["estoque_baixado"])


def cancelar_itens(itens, usuario, motivo):
    devolver(itens, usuario, motivo)
    for item in itens:
        if not item.cancelado:
            item.cancelado = True
            item.motivo_cancelamento = motivo
            item.save(update_fields=["cancelado", "motivo_cancelamento", "atualizado_em"])
