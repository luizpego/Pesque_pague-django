from django.db import migrations


ADMIN_USERNAME = "admin_pesque_pague"


def promover_admin(apps, schema_editor):
    Usuario = apps.get_model("core", "Usuario")
    Usuario.objects.filter(username=ADMIN_USERNAME).update(
        papel="gerente",
        is_staff=True,
        is_superuser=True,
        is_active=True,
    )


def reverter_promocao(apps, schema_editor):
    Usuario = apps.get_model("core", "Usuario")
    Usuario.objects.filter(username=ADMIN_USERNAME).update(
        papel="cliente",
        is_staff=False,
        is_superuser=False,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_requisicaoidempotente_comanda_cancelada_em_and_more"),
    ]

    operations = [
        migrations.RunPython(promover_admin, reverter_promocao),
    ]
