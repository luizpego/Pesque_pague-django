from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import CategoriaCardapio, Comanda, ItemCardapio, ItemComanda, Mesa, Pagamento, Usuario


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
    inlines = [ItemComandaInline]


@admin.register(Pagamento)
class PagamentoAdmin(admin.ModelAdmin):
    list_display = ["id", "comanda", "mercado_pago_id", "status", "valor", "criado_em"]
    list_filter = ["status"]
    readonly_fields = ["mercado_pago_id", "qr_code", "qr_code_base64", "criado_em", "atualizado_em"]
