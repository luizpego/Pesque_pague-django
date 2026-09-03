from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Popula o banco com dados iniciais seguros, sem criar usuários demo."

    def handle(self, *args, **options):
        call_command("seed_catalog")
        self.stdout.write(self.style.SUCCESS("Dados iniciais seguros criados com sucesso."))
