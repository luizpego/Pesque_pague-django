from django.db import migrations


NOME = "Clube Imperial"


def aplicar(apps, schema_editor):
    Configuracao = apps.get_model("core", "ConfiguracaoEstabelecimento")
    config = Configuracao.objects.first()
    if config is None:
        Configuracao.objects.create(pk=1, nome=NOME)
    elif config.nome != NOME:
        config.nome = NOME
        config.save(update_fields=["nome"])


class Migration(migrations.Migration):
    dependencies = [("core", "0015_alter_configuracaoestabelecimento_nome")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
