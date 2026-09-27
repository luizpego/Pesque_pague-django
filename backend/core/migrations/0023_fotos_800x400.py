from io import BytesIO
from pathlib import Path

from django.db import migrations
from PIL import Image, UnidentifiedImageError


# (arquivo em core/fotos_cardapio/, nome do produto no cardápio)
# Todas as fotos foram padronizadas em JPG 800x400 (paisagem) ou 400x800 (retrato), comprimidas para o padrão visual
# dos cartões do cardápio. Só toca fotos seed "cardapio/*"; uploads feitos
# pelo admin têm outro nome e são preservados.
FOTOS = [
    ("brahma-600ml.jpg", "Brahma 600ml"),
    ("brahma-litrao.jpg", "Brahma Litrão"),
    ("heineken-600ml.jpg", "Heineken 600ml"),
    ("original-600ml.jpg", "Original 600ml"),
    ("heineken-lata.jpg", "Heineken Lata"),
    ("heineken-long-neck.jpg", "Heineken Long Neck"),
    ("smirnoff-ice.jpg", "Smirnoff Ice"),
    ("skol-beats.jpg", "Skol Beats"),
    ("suco-abacaxi.jpg", "Jarra de Suco de Abacaxi"),
    ("suco-laranja.jpg", "Jarra de Suco de Laranja"),
    ("suco-limao.jpg", "Jarra de Suco de Limão"),
    ("h2oh.jpg", "H2OH!"),
    ("energetico.jpg", "Energético"),
    ("caipirinha.jpg", "Caipirinha"),
    ("caipivodka.jpg", "Caipivodka"),
    ("dose-cachaca.jpg", "Dose Cachaça"),
    ("dose-campari.jpg", "Dose Campari"),
    ("dose-bacardi.jpg", "Dose Bacardi"),
    ("dose-vodka.jpg", "Dose Vodka"),
    ("dose-gin.jpg", "Dose Gin"),
    ("dose-montilla.jpg", "Dose Montilla"),
    ("file-tilapia.jpg", "Filé de Tilápia"),
    ("bolinho-tilapia.jpg", "Bolinho de Tilápia"),
    ("bolinho-camarao.jpg", "Bolinho de Camarão"),
    ("batata-bacon.jpg", "Batata com Bacon e Mussarela"),
    ("batata-simples.jpg", "Batata Frita Simples"),
    ("banana-alho.jpg", "Banana com Sal e Alho"),
    ("porcao-boi.jpg", "Porção de Boi Simples"),
    ("porcao-porco.jpg", "Porção de Porco"),
    ("combo-boi-batata.jpg", "Combo Carne de Boi com Batata"),
    ("carvao.jpg", "Saco de Carvão"),
    ("gomas.jpg", "Gomas"),
    ("pipoca.jpg", "Pipoca"),
    ("tilapia-espinho.jpg", "Tilápia com Espinho"),
    ("dose-barril.jpg", "Dose Barril Saborizada"),
    ("dose-presidente.jpg", "Dose Presidente"),
    ("dose-cortezano.jpg", "Dose Cortezano"),
    ("dose-albin.jpg", "Dose Albin"),
    ("refri-lata.jpg", "Refrigerante Lata"),
    ("porcao-bananinha.jpg", "Porção de Bananinha"),
    ("combo-porco-batata.jpg", "Combo Carne de Porco com Batata"),
    ("almoco-sabado.jpg", "Almoço de Sábado (por pessoa)"),
    ("pescado-carpa.jpg", "Carpa (pescado no local)"),
    ("pescado-pacu.jpg", "Pacu (pescado no local)"),
]


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    Arquivo = apps.get_model("core", "ArquivoMidia")
    pasta = Path(__file__).resolve().parent.parent / "fotos_cardapio"

    for arquivo, nome_produto in FOTOS:
        item = Item.objects.using(alias).filter(nome=nome_produto).first()
        if item is None:
            continue
        # Só atualiza fotos seed; foto trocada pelo admin tem outro nome.
        if item.imagem and not str(item.imagem).startswith("cardapio/"):
            continue
        origem = pasta / arquivo
        if not origem.is_file():
            continue
        conteudo = origem.read_bytes()
        try:
            with Image.open(BytesIO(conteudo)) as imagem:
                if imagem.format != "JPEG" or max(imagem.size) > 6000:
                    continue
                imagem.verify()
        except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
            continue
        nome = f"cardapio/{arquivo}"
        Arquivo.objects.using(alias).update_or_create(
            nome=nome, defaults={"conteudo": conteudo, "mime": "image/jpeg"}
        )
        # Remove o arquivo antigo se a extensão mudou (ex. .png -> .jpg).
        if item.imagem and item.imagem != nome:
            Arquivo.objects.using(alias).filter(pk=item.imagem).delete()
        item.imagem = nome
        item.save(update_fields=["imagem"])


class Migration(migrations.Migration):
    dependencies = [("core", "0022_fotos_pescado_local")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
