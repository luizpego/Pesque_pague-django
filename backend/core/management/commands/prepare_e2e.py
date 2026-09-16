import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Mesa, Usuario


class Command(BaseCommand):
    help = "Prepara dados descartáveis dos testes E2E locais."

    def handle(self, *args, **options):
        if not settings.DEBUG or os.environ.get("E2E_ISOLATED_DATABASE") != "1" or Path(settings.DATABASES["default"]["NAME"]).name != "pesque_e2e.sqlite3":
            raise CommandError("Use o runner E2E com banco temporário isolado.")
        password = os.environ.get("E2E_PASSWORD")
        if not password:
            raise CommandError("Senha temporária E2E ausente.")
        for papel in ["gerente", "garcom", "cozinha", "caixa", "cliente"]:
            Usuario.objects.create_user(username=f"e2e_{papel}", password=password, papel=papel)
        Mesa.objects.update_or_create(
            numero=999,
            defaults={"ativa": True, "capacidade": 4, "localizacao": "Teste E2E"},
        )
        self.stdout.write(self.style.SUCCESS("Dados E2E preparados."))
