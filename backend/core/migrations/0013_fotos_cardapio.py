from io import BytesIO
from pathlib import Path

from django.db import migrations
from PIL import Image, UnidentifiedImageError


# (arquivo em core/fotos_cardapio/, nome do produto no cardápio)
FOTOS = [
    ("brahma-600ml.jpg", "Brahma 600ml"),
    ("brahma-litrao.png", "Brahma Litrão"),
    ("heineken-600ml.webp", "Heineken 600ml"),
    ("original-600ml.jpg", "Original 600ml"),
    ("heineken-lata.jpg", "Heineken Lata"),
    ("heineken-long-neck.webp", "Heineken Long Neck"),
    ("smirnoff-ice.jpg", "Smirnoff Ice"),
    ("skol-beats.jpg", "Skol Beats"),
    ("suco-abacaxi.jpg", "Jarra de Suco de Abacaxi"),
    ("suco-laranja.jpg", "Jarra de Suco de Laranja"),
    ("suco-limao.jpg", "Jarra de Suco de Limão"),
    ("h2oh.png", "H2OH!"),
    ("energetico.png", "Energético"),
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
]

MIME_POR_FORMATO = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    Arquivo = apps.get_model("core", "ArquivoMidia")
    pasta = Path(__file__).resolve().parent.parent / "fotos_cardapio"

    for arquivo, nome_produto in FOTOS:
        item = Item.objects.using(alias).filter(nome=nome_produto).first()
        if item is None:
            continue
        # Idempotente: se o item já tem imagem válida no banco, mantém.
        if item.imagem and Arquivo.objects.using(alias).filter(pk=item.imagem).exists():
            continue
        origem = pasta / arquivo
        if not origem.is_file():
            continue
        conteudo = origem.read_bytes()
        if len(conteudo) > 5 * 1024 * 1024:
            continue
        try:
            with Image.open(BytesIO(conteudo)) as imagem:
                if imagem.format not in MIME_POR_FORMATO or max(imagem.size) > 6000:
                    continue
                mime = MIME_POR_FORMATO[imagem.format]
                imagem.verify()
        except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
            continue
        nome = f"cardapio/{arquivo}"
        Arquivo.objects.using(alias).update_or_create(
            nome=nome, defaults={"conteudo": conteudo, "mime": mime}
        )
        item.imagem = nome
        item.save(update_fields=["imagem"])


class Migration(migrations.Migration):
    dependencies = [("core", "0012_cardapio_quiosques")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
