from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from .models import (
    CapturaPesca,
    CategoriaCardapio,
    Comanda,
    ConfiguracaoEstabelecimento,
    EspeciePeixe,
    HorarioFuncionamento,
    ImagemGaleria,
    ImpressaoDocumento,
    ItemCardapio,
    ItemComanda,
    LagoPesca,
    Mesa,
    Pagamento,
    RegistroPesca,
    RegraPesca,
    ServicoPesca,
)

Usuario = get_user_model()

FORMATOS_IMAGEM_PERMITIDOS = {"JPEG", "PNG", "WEBP"}
MIMES_IMAGEM_PERMITIDOS = {"image/jpeg", "image/png", "image/webp"}
TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024
DIMENSAO_MAXIMA_IMAGEM = 6000


def validar_imagem_upload(arquivo):
    if arquivo.size > TAMANHO_MAXIMO_IMAGEM:
        raise serializers.ValidationError("A imagem deve ter no máximo 5 MB.")
    if getattr(arquivo, "content_type", "") not in MIMES_IMAGEM_PERMITIDOS:
        raise serializers.ValidationError("Envie uma imagem JPEG, PNG ou WebP.")
    try:
        arquivo.seek(0)
        with Image.open(arquivo) as imagem:
            formato = imagem.format
            largura, altura = imagem.size
            imagem.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise serializers.ValidationError("O arquivo enviado não é uma imagem válida.")
    finally:
        arquivo.seek(0)
    if formato not in FORMATOS_IMAGEM_PERMITIDOS:
        raise serializers.ValidationError("O formato da imagem não é permitido.")
    if largura > DIMENSAO_MAXIMA_IMAGEM or altura > DIMENSAO_MAXIMA_IMAGEM:
        raise serializers.ValidationError("A imagem deve ter no máximo 6000 x 6000 pixels.")
    return arquivo


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = [
            "id", "username", "first_name", "last_name", "email", "telefone",
            "papel", "preferencia_alto_contraste", "preferencia_fonte_grande",
            "is_superuser",
        ]
        read_only_fields = ["papel", "is_superuser"]


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


    def validate_imagem(self, value):
        return validar_imagem_upload(value)


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
        read_only_fields = ["comanda", "item_cardapio", "preco_unitario", "observacoes"]

    def validate_quantidade(self, value):
        if value <= 0:
            raise serializers.ValidationError("A quantidade deve ser maior que zero.")
        if value > 100:
            raise serializers.ValidationError("A quantidade máxima por item é 100.")
        return value


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
            "pago", "pago_em", "pagamento_atual", "cancelada_em",
            "cancelada_por", "motivo_cancelamento",
        ]
        read_only_fields = [
            "cliente", "status", "pago", "pago_em", "cancelada_em",
            "cancelada_por", "motivo_cancelamento",
        ]
        extra_kwargs = {"observacoes": {"max_length": 500}}

    def get_pagamento_atual(self, obj):
        pagamento = obj.pagamentos.order_by("-criado_em").first()
        return PagamentoSerializer(pagamento).data if pagamento else None


class ConfiguracaoEstabelecimentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracaoEstabelecimento
        fields = [
            "nome",
            "descricao_restaurante",
            "descricao_pesque_pague",
            "telefone",
            "whatsapp",
            "email",
            "endereco",
            "link_mapa",
            "aviso_importante",
            "atualizado_em",
        ]


class HorarioFuncionamentoSerializer(serializers.ModelSerializer):
    dia_nome = serializers.CharField(source="get_dia_semana_display", read_only=True)

    class Meta:
        model = HorarioFuncionamento
        fields = ["id", "dia_semana", "dia_nome", "abre_as", "fecha_as", "fechado", "observacao"]


class LagoPescaSerializer(serializers.ModelSerializer):
    modalidade_nome = serializers.CharField(source="get_modalidade_display", read_only=True)

    class Meta:
        model = LagoPesca
        fields = [
            "id",
            "nome",
            "descricao",
            "modalidade",
            "modalidade_nome",
            "valor_diaria",
            "capacidade",
            "disponivel",
            "imagem",
            "imagem_alt",
        ]


    def validate_imagem(self, value):
        return validar_imagem_upload(value)


class EspeciePeixeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EspeciePeixe
        fields = ["id", "nome", "descricao", "preco_quilo", "disponivel", "imagem", "imagem_alt"]

    def validate_imagem(self, value):
        return validar_imagem_upload(value)


class RegraPescaSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegraPesca
        fields = ["id", "titulo", "descricao", "ordem", "ativa"]


class ServicoPescaSerializer(serializers.ModelSerializer):
    tipo_nome = serializers.CharField(source="get_tipo_display", read_only=True)

    class Meta:
        model = ServicoPesca
        fields = ["id", "nome", "descricao", "tipo", "tipo_nome", "valor", "disponivel"]


class ImagemGaleriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImagemGaleria
        fields = ["id", "area", "titulo", "imagem", "imagem_alt", "ordem"]


    def validate_imagem(self, value):
        return validar_imagem_upload(value)


class CapturaPescaSerializer(serializers.ModelSerializer):
    especie_nome = serializers.CharField(source="especie.nome", read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    registrado_por_nome = serializers.CharField(source="registrado_por.username", read_only=True)

    class Meta:
        model = CapturaPesca
        fields = [
            "id",
            "especie",
            "especie_nome",
            "peso_kg",
            "preco_quilo",
            "total",
            "observacoes",
            "registrado_em",
            "registrado_por_nome",
        ]
        read_only_fields = ["preco_quilo", "registrado_em"]


class RegistroPescaSerializer(serializers.ModelSerializer):
    capturas = CapturaPescaSerializer(many=True, read_only=True)
    lago_nome = serializers.CharField(source="lago.nome", read_only=True)
    modalidade_nome = serializers.CharField(source="get_modalidade_display", read_only=True)
    status_nome = serializers.CharField(source="get_status_display", read_only=True)
    responsavel_nome = serializers.CharField(source="responsavel_entrada.username", read_only=True)
    peso_total_kg = serializers.DecimalField(max_digits=9, decimal_places=3, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = RegistroPesca
        fields = [
            "id",
            "pescador_nome",
            "telefone",
            "lago",
            "lago_nome",
            "modalidade",
            "modalidade_nome",
            "status",
            "status_nome",
            "valor_entrada",
            "observacoes",
            "entrada_em",
            "saida_em",
            "responsavel_nome",
            "peso_total_kg",
            "total",
            "capturas",
        ]
        read_only_fields = ["status", "entrada_em", "saida_em"]
        extra_kwargs = {"observacoes": {"max_length": 1000}}


class ImpressaoDocumentoSerializer(serializers.ModelSerializer):
    tipo_nome = serializers.CharField(source="get_tipo_documento_display", read_only=True)
    status_nome = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ImpressaoDocumento
        fields = [
            "id",
            "tipo_documento",
            "tipo_nome",
            "status",
            "status_nome",
            "quantidade_solicitacoes",
            "gerado_em",
            "ultima_solicitacao_em",
        ]
        read_only_fields = fields
