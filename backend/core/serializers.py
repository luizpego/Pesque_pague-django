from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import CategoriaCardapio, Comanda, ItemCardapio, ItemComanda, Mesa, Pagamento

Usuario = get_user_model()


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = [
            "id", "username", "first_name", "last_name", "email", "telefone",
            "papel", "preferencia_alto_contraste", "preferencia_fonte_grande",
        ]
        read_only_fields = ["papel"]


class RegistroSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = Usuario
        fields = ["id", "username", "first_name", "last_name", "email", "telefone", "password"]

    def create(self, validated_data):
        return Usuario.objects.create_user(**validated_data)


class CategoriaCardapioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaCardapio
        fields = ["id", "nome", "ordem", "icone"]


class ItemCardapioSerializer(serializers.ModelSerializer):
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)

    class Meta:
        model = ItemCardapio
        fields = [
            "id", "categoria", "categoria_nome", "nome", "descricao", "imagem",
            "imagem_alt", "preco", "unidade", "disponivel", "eh_pescado_no_local",
            "tempo_preparo_min",
        ]


class MesaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mesa
        fields = ["id", "numero", "capacidade", "ativa", "localizacao"]


class ItemComandaSerializer(serializers.ModelSerializer):
    item_cardapio_nome = serializers.CharField(source="item_cardapio.nome", read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = ItemComanda
        fields = [
            "id", "comanda", "item_cardapio", "item_cardapio_nome", "quantidade",
            "preco_unitario", "observacoes", "subtotal",
        ]
        read_only_fields = ["preco_unitario"]


class PagamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pagamento
        fields = [
            "id", "comanda", "mercado_pago_id", "status", "valor",
            "qr_code", "qr_code_base64", "criado_em", "atualizado_em",
        ]
        read_only_fields = fields


class ComandaSerializer(serializers.ModelSerializer):
    itens = ItemComandaSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    mesa_numero = serializers.IntegerField(source="mesa.numero", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.username", read_only=True)
    pagamento_atual = serializers.SerializerMethodField()

    class Meta:
        model = Comanda
        fields = [
            "id", "mesa", "mesa_numero", "cliente", "cliente_nome", "status",
            "observacoes", "criada_em", "atualizada_em", "itens", "total",
            "pago", "pago_em", "pagamento_atual",
        ]
        read_only_fields = ["cliente", "pago", "pago_em"]

    def get_pagamento_atual(self, obj):
        pagamento = obj.pagamentos.order_by("-criado_em").first()
        return PagamentoSerializer(pagamento).data if pagamento else None
