from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.db import migrations
from PIL import Image, UnidentifiedImageError


def preservar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Documento = apps.get_model("core", "ImpressaoDocumento")
    Pedido = apps.get_model("core", "Pedido")
    Arquivo = apps.get_model("core", "ArquivoMidia")
    for pedido in Pedido.objects.using(alias).exclude(status__in=["cancelado", "entregue"]).iterator():
        Documento.objects.using(alias).get_or_create(pedido_id=pedido.pk, defaults={
            "comanda_id": pedido.comanda_id, "tipo_documento": "cozinha", "status": "pendente",
        })
    raiz = Path(settings.MEDIA_ROOT).resolve()
    for modelo, campo in [("ItemCardapio", "imagem"), ("LagoPesca", "imagem"),
            ("EspeciePeixe", "imagem"), ("ImagemGaleria", "imagem"), ("ConfiguracaoEstabelecimento", "banner")]:
        nomes = apps.get_model("core", modelo).objects.using(alias).exclude(**{campo: ""}).values_list(campo, flat=True)
        for nome in nomes:
            if not nome or Arquivo.objects.using(alias).filter(pk=nome).exists():
                continue
            caminho = (raiz / nome).resolve()
            if not caminho.is_relative_to(raiz) or not caminho.is_file() or caminho.stat().st_size > 5 * 1024 * 1024:
                continue
            conteudo = caminho.read_bytes()
            try:
                with Image.open(BytesIO(conteudo)) as imagem:
                    if imagem.format not in {"JPEG", "PNG", "WEBP"}:
                        continue
                    mime = Image.MIME[imagem.format]
                    imagem.verify()
            except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
                continue
            Arquivo.objects.using(alias).create(nome=nome, conteudo=conteudo, mime=mime)


class Migration(migrations.Migration):
    dependencies = [("core", "0009_arquivomidia")]
    operations = [migrations.RunPython(preservar, migrations.RunPython.noop)]
