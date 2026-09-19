from django.contrib.auth.hashers import make_password
from django.db import migrations


ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@pesquepague.local"
ADMIN_PASSWORD = "Pesque2026@Admin"  # Troque após primeiro acesso


def ensure_admin(apps, schema_editor):
    Usuario = apps.get_model("core", "Usuario")
    if Usuario.objects.filter(username=ADMIN_USERNAME).exists():
        # Garante que mesmo se já existir, fique ativo e com permissão
        Usuario.objects.filter(username=ADMIN_USERNAME).update(
            is_staff=True,
            is_superuser=True,
            is_active=True,
            papel="gerente",
            email=ADMIN_EMAIL,
        )
        # Atualiza senha caso tenha sido alterada no código
        user = Usuario.objects.get(username=ADMIN_USERNAME)
        user.password = make_password(ADMIN_PASSWORD)
        user.save(update_fields=["password"])
        return

    user = Usuario(
        username=ADMIN_USERNAME,
        email=ADMIN_EMAIL,
        is_staff=True,
        is_superuser=True,
        is_active=True,
        papel="gerente",
    )
    user.password = make_password(ADMIN_PASSWORD)
    user.save()


def remove_admin(apps, schema_editor):
    Usuario = apps.get_model("core", "Usuario")
    Usuario.objects.filter(username=ADMIN_USERNAME).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0010_preservar_imagens_e_fila")]
    operations = [migrations.RunPython(ensure_admin, remove_admin)]
