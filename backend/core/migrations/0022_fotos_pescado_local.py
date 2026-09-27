from io import BytesIO
from pathlib import Path

from django.db import migrations
from PIL import Image, UnidentifiedImageError


# Fotos para os pescados do lago mantidos por terem vendas vinculadas.
FOTOS = [
    ("pescado-carpa.jpg", "Carpa (pescado no local)", "Foto ilustrativa: carpa frita"),
    ("pescado-pacu.jpg", "Pacu (pescado no local)", "Foto ilustrativa: peixe grelhado"),
]


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Item = apps.get_model("core", "ItemCardapio")
    Arquivo = apps.get_model("core", "ArquivoMidia")
    pasta = Path(__file__).resolve().parent.parent / "fotos_cardapio"

    for arquivo, nome_produto, alt in FOTOS:
        item = Item.objects.using(alias).filter(nome=nome_produto).first()
        if item is None:
            continue
        origem = pasta / arquivo
        if not origem.is_file():
            continue
        conteudo = origem.read_bytes()
        if len(conteudo) > 5 * 1024 * 1024:
            continue
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
        if item.imagem and item.imagem != nome:
            Arquivo.objects.using(alias).filter(pk=item.imagem).delete()
        item.imagem = nome
        item.imagem_alt = alt
        item.save(update_fields=["imagem", "imagem_alt"])


class Migration(migrations.Migration):
    dependencies = [("core", "0021_foto_porcao_porco")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
