from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Comanda, Mesa, Usuario


class Command(BaseCommand):
    help = "Prepara dados descartáveis dos testes E2E locais."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("prepare_e2e é proibido com DEBUG=False.")
        Comanda.objects.filter(mesa__numero=999).delete()
        Usuario.objects.filter(username__startswith="e2e_").delete()
        Mesa.objects.update_or_create(
            numero=999,
            defaults={"ativa": True, "capacidade": 4, "localizacao": "Teste E2E"},
        )
        self.stdout.write(self.style.SUCCESS("Dados E2E preparados."))
