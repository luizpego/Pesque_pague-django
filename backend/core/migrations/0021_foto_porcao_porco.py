from io import BytesIO
from pathlib import Path

from django.db import migrations
from PIL import Image, UnidentifiedImageError


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    Arquivo = apps.get_model("core", "ArquivoMidia")
    item = Item.objects.using(alias).filter(nome="Porção de Porco").first()
    if item is None:
        return
    origem = Path(__file__).resolve().parent.parent / "fotos_cardapio" / "porcao-porco.jpg"
    if not origem.is_file():
        return
    conteudo = origem.read_bytes()
    try:
        with Image.open(BytesIO(conteudo)) as imagem:
            if imagem.format != "JPEG" or max(imagem.size) > 6000:
                return
            imagem.verify()
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
        return
    nome = "cardapio/porcao-porco.jpg"
    Arquivo.objects.using(alias).update_or_create(
        nome=nome, defaults={"conteudo": conteudo, "mime": "image/jpeg"}
    )
    if item.imagem and item.imagem != nome:
        Arquivo.objects.using(alias).filter(pk=item.imagem).delete()
    item.imagem = nome
    item.save(update_fields=["imagem"])


class Migration(migrations.Migration):
    dependencies = [("core", "0020_fotos_melhoradas")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
