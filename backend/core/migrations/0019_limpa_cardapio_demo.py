from django.db import migrations


# Itens do catálogo demonstrativo antigo (seed inicial). Não fazem parte do
# cardápio oficial e duplicavam produtos novos ("Refrigerante lata" x
# "Refrigerante Lata"). Só apaga quem nunca foi vendido; com venda vinculada
# o item é mantido para preservar o histórico.
ITENS_DEMO = [
    "Tilapia (pescado no local)",
    "Pacu (pescado no local)",
    "Carpa (pescado no local)",
    "Tilapia frita",
    "Camarao a milanesa",
    "Arroz branco",
    "Farofa da casa",
    "Vinagrete",
    "Batata frita",
    "Suco de limao",
    "Refrigerante lata",
    "Agua mineral",
    "Pudim de leite",
]

CATEGORIAS_DEMO = [
    "Peixes pescados",
    "Frituras",
    "Acompanhamentos",
    "Bebidas",
    "Sobremesas",
]


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    ItemComanda = apps.get_model("core", "ItemComanda")
    Categoria = apps.get_model("core", "CategoriaCardapio")
    Arquivo = apps.get_model("core", "ArquivoMidia")

    vendidos = set(
        ItemComanda.objects.using(alias).values_list("item_cardapio_id", flat=True).distinct()
    )
    for nome in ITENS_DEMO:
        item = Item.objects.using(alias).filter(nome=nome).first()
        if item is None or item.pk in vendidos:
            continue
        foto = item.imagem
        item.delete()
        if foto:
            Arquivo.objects.using(alias).filter(pk=foto).delete()

    for nome in CATEGORIAS_DEMO:
        categoria = Categoria.objects.using(alias).filter(nome=nome).first()
        if categoria is not None and not Item.objects.using(alias).filter(categoria=categoria).exists():
            categoria.delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0018_fotos_padronizadas")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
