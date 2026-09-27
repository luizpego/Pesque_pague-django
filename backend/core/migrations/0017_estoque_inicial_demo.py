from decimal import Decimal

from django.db import migrations


# (nome do produto, saldo inicial, estoque mínimo)
# Estoque de demonstração: ative a baixa automática conforme as vendas.
ESTOQUE = [
    ("Brahma 600ml", "100", "12"),
    ("Heineken 600ml", "60", "12"),
    ("Original 600ml", "60", "12"),
    ("Skol Beats", "40", "6"),
    ("Filé de Tilápia", "20", "3"),
    ("Batata Frita Simples", "30", "5"),
    ("Bolinho de Tilápia", "25", "5"),
    ("Saco de Carvão", "15", "2"),
]


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    for nome, saldo, minimo in ESTOQUE:
        item = Item.objects.using(alias).filter(nome=nome).first()
        if item is None or item.controla_estoque:
            continue
        item.controla_estoque = True
        item.estoque_atual = Decimal(saldo)
        item.estoque_minimo = Decimal(minimo)
        item.save(update_fields=["controla_estoque", "estoque_atual", "estoque_minimo"])


class Migration(migrations.Migration):
    dependencies = [("core", "0016_nome_clube_imperial")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
