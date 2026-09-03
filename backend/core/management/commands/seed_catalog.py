from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import CategoriaCardapio, ItemCardapio, Mesa


class Command(BaseCommand):
    help = "Popula o banco com mesas, categorias e itens do cardapio, sem criar usuarios demo."

    @transaction.atomic
    def handle(self, *args, **options):
        localizacoes = ["Lago 1", "Lago 2", "Lago 3", "Deck coberto", "Varanda", "Salao principal"]
        for i in range(1, 13):
            Mesa.objects.get_or_create(
                numero=i,
                defaults={"capacidade": 4, "localizacao": localizacoes[i % len(localizacoes)]},
            )
        self.stdout.write(self.style.SUCCESS("Mesas criadas."))

        categorias_dados = [
            ("Peixes pescados", "pescaria", 1),
            ("Frituras", "peixe", 2),
            ("Acompanhamentos", "arroz", 3),
            ("Bebidas", "bebida", 4),
            ("Sobremesas", "sobremesa", 5),
        ]
        categorias = {}
        for nome, icone, ordem in categorias_dados:
            categoria, _ = CategoriaCardapio.objects.get_or_create(
                nome=nome, defaults={"icone": icone, "ordem": ordem}
            )
            categorias[nome] = categoria
        self.stdout.write(self.style.SUCCESS("Categorias criadas."))

        itens = [
            ("Tilapia (pescado no local)", "Peixes pescados", 32.90, ItemCardapio.Unidade.QUILO, True, "Tilapia fresca pescada por voce no lago, preparada como preferir."),
            ("Pacu (pescado no local)", "Peixes pescados", 38.90, ItemCardapio.Unidade.QUILO, True, "Pacu fresco pescado no local, ideal para grelhar ou fritar."),
            ("Carpa (pescado no local)", "Peixes pescados", 29.90, ItemCardapio.Unidade.QUILO, True, "Carpa fresca pescada no lago da casa."),
            ("Tilapia frita", "Frituras", 42.00, ItemCardapio.Unidade.PORCAO, False, "File de tilapia empanado e frito na hora, porcao para 2 pessoas."),
            ("Camarao a milanesa", "Frituras", 55.00, ItemCardapio.Unidade.PORCAO, False, "Camaroes empanados e fritos, servidos com molho tartaro."),
            ("Arroz branco", "Acompanhamentos", 12.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Farofa da casa", "Acompanhamentos", 10.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Vinagrete", "Acompanhamentos", 8.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Batata frita", "Acompanhamentos", 18.00, ItemCardapio.Unidade.PORCAO, False, ""),
            ("Suco de limao", "Bebidas", 8.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Refrigerante lata", "Bebidas", 7.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Agua mineral", "Bebidas", 5.00, ItemCardapio.Unidade.UNIDADE, False, ""),
            ("Pudim de leite", "Sobremesas", 12.00, ItemCardapio.Unidade.UNIDADE, False, ""),
        ]
        for nome, categoria_nome, preco, unidade, pescado, descricao in itens:
            ItemCardapio.objects.get_or_create(
                nome=nome,
                defaults={
                    "categoria": categorias[categoria_nome],
                    "preco": preco,
                    "unidade": unidade,
                    "eh_pescado_no_local": pescado,
                    "descricao": descricao,
                    "imagem_alt": f"Foto ilustrativa do prato {nome}",
                },
            )
        self.stdout.write(self.style.SUCCESS("Cardapio populado com sucesso."))
