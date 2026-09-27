from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Mesa


class Command(BaseCommand):
    help = "Garante os quiosques. O cardápio oficial vive nas migrations (sem itens demo)."

    @transaction.atomic
    def handle(self, *args, **options):
        for i in range(1, 16):
            Mesa.objects.get_or_create(
                numero=i,
                defaults={"capacidade": 6, "localizacao": f"Quiosque {i}"},
            )
        self.stdout.write(self.style.SUCCESS("Quiosques criados."))
        self.stdout.write(self.style.SUCCESS("Cardápio oficial mantido pelas migrations."))
