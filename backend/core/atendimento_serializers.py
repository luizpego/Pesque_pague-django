from decimal import Decimal

from rest_framework import serializers

from .models import Comanda, EventoComanda, ItemComanda, Pagamento, Pedido
from .serializers import ImpressaoDocumentoSerializer


class LinhaSerializer(serializers.ModelSerializer):
    item_cardapio_nome = serializers.CharField(source="nome_registrado", read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    funcionario = serializers.CharField(source="criado_por.username", default="", read_only=True)

    class Meta:
        model = ItemComanda
        fields = ["id", "pedido", "item_cardapio", "item_cardapio_nome", "quantidade",
                  "preco_unitario", "subtotal", "observacoes", "cancelado",
                  "motivo_cancelamento", "criado_em", "atualizado_em", "funcionario"]


class PedidoSerializer(serializers.ModelSerializer):
    impressao = ImpressaoDocumentoSerializer(read_only=True)
    itens = LinhaSerializer(many=True, read_only=True)
    funcionario = serializers.CharField(source="responsavel.username", default="", read_only=True)

    class Meta:
        model = Pedido
        fields = ["id", "status", "criado_em", "atualizado_em", "funcionario",
                  "cancelado_em", "motivo_cancelamento", "itens", "impressao"]


class RecebimentoSerializer(serializers.ModelSerializer):
    funcionario = serializers.CharField(source="registrado_por.username", default="", read_only=True)

    class Meta:
        model = Pagamento
        fields = ["id", "forma", "origem", "status", "valor", "criado_em", "funcionario"]


class EventoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventoComanda
        fields = ["id", "acao", "usuario_nome", "criado_em", "dados"]


class AtendimentoResumoSerializer(serializers.ModelSerializer):
    mesa_numero = serializers.IntegerField(source="mesa.numero", default=None, read_only=True)
    funcionario = serializers.CharField(source="responsavel.username", default="", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.username", default="", read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    quantidade_pedidos = serializers.SerializerMethodField()
    pagamentos = RecebimentoSerializer(many=True, read_only=True)

    class Meta:
        model = Comanda
        fields = ["id", "mesa", "mesa_numero", "identificacao", "cliente_nome", "status",
                  "criada_em", "fechada_em", "funcionario", "quantidade_pedidos",
                  "subtotal", "desconto", "acrescimo", "total", "pago", "pagamentos", "versao"]

    def get_quantidade_pedidos(self, obj):
        return obj.pedidos.count()


class AtendimentoSerializer(AtendimentoResumoSerializer):
    pedidos = PedidoSerializer(many=True, read_only=True)
    itens = LinhaSerializer(many=True, read_only=True)
    eventos = EventoSerializer(many=True, read_only=True)
    fechamento_funcionario = serializers.CharField(source="fechada_por.username", default="", read_only=True)

    class Meta(AtendimentoResumoSerializer.Meta):
        fields = AtendimentoResumoSerializer.Meta.fields + [
            "pedidos", "itens", "eventos", "observacoes", "motivo_cancelamento",
            "cancelada_em", "pago_em", "fechamento_funcionario",
        ]


class VersaoSerializer(serializers.Serializer):
    versao = serializers.IntegerField(min_value=0)


class AberturaSerializer(serializers.Serializer):
    mesa = serializers.IntegerField(min_value=1, max_value=9223372036854775807, required=False, allow_null=True)
    identificacao = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    observacoes = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate(self, data):
        if not data.get("mesa") and not data.get("identificacao"):
            raise serializers.ValidationError("Informe a mesa ou a identificação do atendimento.")
        return data


class NovoItemSerializer(serializers.Serializer):
    item_cardapio = serializers.IntegerField(min_value=1, max_value=9223372036854775807)
    quantidade = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("100"))
    observacoes = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")


class NovoPedidoSerializer(VersaoSerializer):
    itens = NovoItemSerializer(many=True, allow_empty=False, max_length=100)


class AlterarItemSerializer(VersaoSerializer):
    quantidade = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("100"))
    observacoes = serializers.CharField(max_length=200, allow_blank=True)


class CancelarSerializer(VersaoSerializer):
    motivo = serializers.CharField(min_length=5, max_length=500)


class StatusPedidoSerializer(VersaoSerializer):
    status = serializers.ChoiceField(choices=Pedido.Status.choices)
    motivo = serializers.CharField(min_length=5, max_length=500, required=False)


class ParcelaSerializer(serializers.Serializer):
    forma = serializers.ChoiceField(choices=Pagamento.Forma.choices)
    valor = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))


class FechamentoSerializer(VersaoSerializer):
    desconto = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), default=0)
    acrescimo = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), default=0)
    pagamentos = ParcelaSerializer(many=True, allow_empty=True, max_length=10, default=list)
