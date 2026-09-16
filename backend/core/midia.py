import hashlib
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.http import Http404, HttpResponse
from django.urls import reverse
from PIL import Image, UnidentifiedImageError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .models import ArquivoMidia


class BancoImagemStorage(Storage):
    def _save(self, name, content):
        content.seek(0)
        bruto = content.read(5 * 1024 * 1024 + 1)
        if len(bruto) > 5 * 1024 * 1024:
            raise ValueError("Imagem maior que 5 MB.")
        try:
            with Image.open(BytesIO(bruto)) as imagem:
                if imagem.format not in {"PNG", "JPEG", "WEBP"} or max(imagem.size) > 6000:
                    raise ValueError("Formato ou dimensões da imagem não permitidos.")
                mime = Image.MIME[imagem.format]
                imagem.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise ValueError("Imagem inválida.") from exc
        ArquivoMidia.objects.create(nome=name, conteudo=bruto, mime=mime)
        return name

    def _open(self, name, mode="rb"):
        return ContentFile(bytes(ArquivoMidia.objects.get(pk=name).conteudo), name=name)

    def exists(self, name):
        return ArquivoMidia.objects.filter(pk=name).exists()

    def size(self, name):
        return len(ArquivoMidia.objects.only("conteudo").get(pk=name).conteudo)

    def url(self, name):
        return reverse("midia", kwargs={"nome": name})

    def delete(self, name):
        ArquivoMidia.objects.filter(pk=name).delete()


class MidiaView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, nome):
        arquivo = ArquivoMidia.objects.filter(pk=nome).first()
        if not arquivo:
            raise Http404
        conteudo = bytes(arquivo.conteudo)
        etag = '"' + hashlib.sha256(conteudo).hexdigest() + '"'
        response = HttpResponse(status=304) if request.headers.get("If-None-Match") == etag else HttpResponse(conteudo, content_type=arquivo.mime)
        response["ETag"] = etag
        response["Cache-Control"] = "public, max-age=86400, immutable"
        response["X-Content-Type-Options"] = "nosniff"
        return response
