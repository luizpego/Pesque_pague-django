from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import CategoriaCardapio, ItemCardapio, Mesa

Usuario = get_user_model()


class Command(BaseCommand):
    help = "Popula o banco com dados de exemplo: mesas, cardápio e usuários demo."

    @transaction.atomic
    def handle(self, *args, **options):
        # Usuários de demonstração
        if not Usuario.objects.filter(username="gerente").exists():
            Usuario.objects.create_superuser(
                username="gerente", email="gerente@pesqueepague.com.br",
                password="pescaria123", papel=Usuario.Papel.GERENTE,
                first_name="Gerente",
            )
            self.stdout.write(self.style.SUCCESS("Usuário 'gerente' criado (senha: pescaria123)"))

        if not Usuario.objects.filter(username="garcom").exists():
            Usuario.objects.create_user(
                username="garcom", email="garcom@pesqueepague.com.br",
                password="pescaria123", papel=Usuario.Papel.GARCOM,
                first_name="Garçom",
            )
            self.stdout.write(self.style.SUCCESS("Usuário 'garcom' criado (senha: pescaria123)"))

        if not Usuario.objects.filter(username="cliente").exists():
            Usuario.objects.create_user(
                username="cliente", email="cliente@exemplo.com",
                password="pescaria123", papel=Usuario.Papel.CLIENTE,
                first_name="Cliente Teste",
            )
            self.stdout.write(self.style.SUCCESS("Usuário 'cliente' criado (senha: pescaria123)"))

        # Mesas / pontos de pesca
        localizacoes = ["Lago 1", "Lago 2", "Lago 3", "Deck coberto", "Varanda", "Salão principal"]
        for i in range(1, 13):
            Mesa.objects.get_or_create(
                numero=i,
                defaults={"capacidade": 4, "localizacao": localizacoes[i % len(localizacoes)]},
            )
        self.stdout.write(self.style.SUCCESS("Mesas criadas."))

        # Categorias
        categorias_dados = [
            ("Peixes pescados", "🎣", 1),
            ("Frituras", "🐟", 2),
            ("Acompanhamentos", "🍚", 3),
            ("Bebidas", "🥤", 4),
            ("Sobremesas", "🍮", 5),
        ]
        categorias = {}
        for nome, icone, ordem in categorias_dados:
            cat, _ = CategoriaCardapio.objects.get_or_create(
                nome=nome, defaults={"icone": icone, "ordem": ordem}
            )
            categorias[nome] = cat
        self.stdout.write(self.style.SUCCESS("Categorias criadas."))

        # Itens do cardápio
        itens = [
            ("Tilápia (pescado no local)", "Peixes pescados", 32.90, ItemCardapio.Unidade.QUILO, True,
             "Tilápia fresca pescada por você no lago, preparada como preferir."),
            ("Pacu (pescado no local)", "Peixes pescados", 38.90, ItemCardapio.Unidade.QUILO, True,
             "Pacu fresco pescado no local, ideal para grelhar ou fritar."),
            ("Carpa (pescado no local)", "Peixes pescados", 29.90, ItemCardapio.Unidade.QUILO, True,
             "Carpa fresca pescada no lago da casa."),
            ("Tilápia frita", "Frituras", 42.00, ItemCardapio.Unidade.PORCAO, False,
             "Filé de tilápia empanado e frito na hora, porção para 2 pessoas."),
            ("Camarão à milanesa", "Frituras", 55.00, ItemCardapio.Unidade.PORCAO, False,
             "Camarões empanados e fritos, servidos com molho tártaro."),
            ("Arroz branco", "Acompanhamentos", 12.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Farofa da casa", "Acompanhamentos", 10.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Vinagrete", "Acompanhamentos", 8.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Batata frita", "Acompanhamentos", 18.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Suco de limão", "Bebidas", 8.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Refrigerante lata", "Bebidas", 7.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Água mineral", "Bebidas", 5.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Pudim de leite", "Sobremesas", 12.00, ItemCardapio.Unidade.UNIDADE, False, ""),
        ]
        for nome, cat_nome, preco, unidade, pescado, descricao in itens:
            ItemCardapio.objects.get_or_create(
                nome=nome,
                defaults={
                    "categoria": categorias[cat_nome],
                    "preco": preco,
                    "unidade": unidade,
                    "eh_pescado_no_local": pescado,
                    "descricao": descricao,
                    "imagem_alt": f"Foto ilustrativa do prato {nome}",
                },
            )
        self.stdout.write(self.style.SUCCESS("Cardápio populado."))
        self.stdout.write(self.style.SUCCESS("Dados de exemplo criados com sucesso! 🎣"))
