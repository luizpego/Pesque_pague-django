from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

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
    Usuario,
)


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Pesque & Pague", {
            "fields": (
                "papel", "telefone",
                "preferencia_alto_contraste", "preferencia_fonte_grande",
            )
        }),
    )
    list_display = ["username", "email", "papel", "is_staff"]
    list_filter = ["papel", "is_staff", "is_superuser"]


@admin.register(Mesa)
class MesaAdmin(admin.ModelAdmin):
    list_display = ["numero", "localizacao", "capacidade", "ativa"]
    list_filter = ["ativa"]


@admin.register(CategoriaCardapio)
class CategoriaCardapioAdmin(admin.ModelAdmin):
    list_display = ["nome", "icone", "ordem"]


class ItemComandaInline(admin.TabularInline):
    model = ItemComanda
    extra = 0


@admin.register(ItemCardapio)
class ItemCardapioAdmin(admin.ModelAdmin):
    list_display = ["nome", "categoria", "preco", "unidade", "disponivel", "eh_pescado_no_local"]
    list_filter = ["categoria", "disponivel", "eh_pescado_no_local"]
    search_fields = ["nome", "descricao"]


@admin.register(Comanda)
class ComandaAdmin(admin.ModelAdmin):
    list_display = ["id", "mesa", "cliente", "status", "pago", "total", "criada_em"]
    list_filter = ["status", "pago", "mesa"]
    readonly_fields = ["cancelada_em", "cancelada_por", "motivo_cancelamento"]
    inlines = [ItemComandaInline]


@admin.register(Pagamento)
class PagamentoAdmin(admin.ModelAdmin):
    list_display = ["id", "comanda", "mercado_pago_id", "status", "valor", "criado_em"]
    list_filter = ["status"]
    readonly_fields = ["mercado_pago_id", "qr_code", "qr_code_base64", "criado_em", "atualizado_em"]


@admin.register(ConfiguracaoEstabelecimento)
class ConfiguracaoEstabelecimentoAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Identidade", {"fields": ("nome", "descricao_restaurante", "descricao_pesque_pague")}),
        ("Contato e localização", {"fields": ("telefone", "whatsapp", "email", "endereco", "link_mapa")}),
        ("Comunicação", {"fields": ("aviso_importante",)}),
    )

    def has_add_permission(self, request):
        return not ConfiguracaoEstabelecimento.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(HorarioFuncionamento)
class HorarioFuncionamentoAdmin(admin.ModelAdmin):
    list_display = ["dia_semana", "abre_as", "fecha_as", "fechado", "observacao"]
    list_editable = ["abre_as", "fecha_as", "fechado", "observacao"]


@admin.register(LagoPesca)
class LagoPescaAdmin(admin.ModelAdmin):
    list_display = ["nome", "modalidade", "valor_diaria", "capacidade", "disponivel"]
    list_filter = ["modalidade", "disponivel"]
    search_fields = ["nome", "descricao"]


@admin.register(EspeciePeixe)
class EspeciePeixeAdmin(admin.ModelAdmin):
    list_display = ["nome", "preco_quilo", "disponivel"]
    list_filter = ["disponivel"]
    search_fields = ["nome", "descricao"]


@admin.register(RegraPesca)
class RegraPescaAdmin(admin.ModelAdmin):
    list_display = ["titulo", "ordem", "ativa"]
    list_editable = ["ordem", "ativa"]


@admin.register(ServicoPesca)
class ServicoPescaAdmin(admin.ModelAdmin):
    list_display = ["nome", "tipo", "valor", "disponivel"]
    list_filter = ["tipo", "disponivel"]


@admin.register(ImagemGaleria)
class ImagemGaleriaAdmin(admin.ModelAdmin):
    list_display = ["titulo", "area", "ordem", "ativa"]
    list_filter = ["area", "ativa"]


class CapturaPescaInline(admin.TabularInline):
    model = CapturaPesca
    extra = 0
    readonly_fields = ["preco_quilo", "registrado_em", "registrado_por"]


@admin.register(RegistroPesca)
class RegistroPescaAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "pescador_nome",
        "lago",
        "modalidade",
        "status",
        "peso_total_kg",
        "total",
        "entrada_em",
    ]
    list_filter = ["status", "modalidade", "lago"]
    search_fields = ["pescador_nome", "telefone"]
    readonly_fields = ["entrada_em", "saida_em", "responsavel_entrada"]
    inlines = [CapturaPescaInline]


@admin.register(ImpressaoDocumento)
class ImpressaoDocumentoAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "tipo_documento",
        "status",
        "quantidade_solicitacoes",
        "gerado_em",
        "ultima_solicitacao_em",
    ]
    list_filter = ["tipo_documento", "status"]
    readonly_fields = [
        "tipo_documento",
        "comanda",
        "registro_pesca",
        "status",
        "quantidade_solicitacoes",
        "gerado_em",
        "ultima_solicitacao_em",
        "gerado_por",
    ]
