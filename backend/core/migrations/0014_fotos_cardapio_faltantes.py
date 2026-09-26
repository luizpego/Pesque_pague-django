from io import BytesIO
from pathlib import Path

from django.db import migrations
from PIL import Image, UnidentifiedImageError


# (arquivo em core/fotos_cardapio/, nome do produto no cardápio)
# Fotos de doses genéricas e pratos vindas do Wikimedia Commons
# (licenças livres CC BY / CC BY-SA — crédito aos autores originais).
# Troque por fotos próprias pelo admin quando quiser.
FOTOS = [
    ("tilapia-espinho.jpg", "Tilápia com Espinho"),
    ("dose-barril.jpg", "Dose Barril Saborizada"),
    ("dose-presidente.jpg", "Dose Presidente"),
    ("dose-cortezano.jpg", "Dose Cortezano"),
    ("dose-albin.jpg", "Dose Albin"),
    ("refri-lata.jpg", "Refrigerante Lata"),
    ("porcao-bananinha.jpg", "Porção de Bananinha"),
    ("combo-porco-batata.jpg", "Combo Carne de Porco com Batata"),
    ("almoco-sabado.jpg", "Almoço de Sábado (por pessoa)"),
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
    dependencies = [("core", "0013_fotos_cardapio")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
