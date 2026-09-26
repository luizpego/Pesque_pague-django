from decimal import Decimal

from django.db import migrations


# (categoria, icone, ordem)
CATEGORIAS = [
    ("Cervejas", "🍺", 1),
    ("Doses e Drinks", "🍹", 2),
    ("Bebidas sem Álcool", "🥤", 3),
    ("Porções e Petiscos", "🍟", 4),
    ("Combos", "🍖", 5),
    ("Almoço", "🍛", 6),
    ("Extras", "🛒", 7),
]

# (nome, categoria, preco, unidade, disponivel, descricao)
# unidade: "un" = unidade, "porcao" = porção
ITENS = [
    # Cervejas
    ("Brahma 600ml", "Cervejas", "12.00", "un", True, "Cerveja Brahma garrafa 600ml."),
    ("Brahma Litrão", "Cervejas", "16.00", "un", True, "Cerveja Brahma litrão."),
    ("Heineken 600ml", "Cervejas", "17.00", "un", True, "Cerveja Heineken garrafa 600ml."),
    ("Original 600ml", "Cervejas", "16.00", "un", True, "Cerveja Original garrafa 600ml."),
    ("Heineken Lata", "Cervejas", "12.00", "un", True, "Cerveja Heineken lata."),
    ("Heineken Long Neck", "Cervejas", "12.00", "un", True, "Cerveja Heineken long neck."),
    ("Smirnoff Ice", "Cervejas", "6.00", "un", True, "Bebida Smirnoff Ice."),
    ("Skol Beats", "Cervejas", "12.00", "un", True, "Bebida Skol Beats."),
    # Bebidas sem álcool
    ("H2OH!", "Bebidas sem Álcool", "8.00", "un", True, "Água saborizada H2OH!."),
    ("Refrigerante Lata", "Bebidas sem Álcool", "8.00", "un", True, "Refrigerante em lata."),
    ("Energético", "Bebidas sem Álcool", "16.00", "un", True, "Energético em lata."),
    ("Jarra de Suco de Abacaxi", "Bebidas sem Álcool", "25.00", "un", True, "Jarra de suco natural de abacaxi."),
    ("Jarra de Suco de Laranja", "Bebidas sem Álcool", "25.00", "un", True, "Jarra de suco natural de laranja."),
    ("Jarra de Suco de Limão", "Bebidas sem Álcool", "20.00", "un", True, "Jarra de suco natural de limão."),
    # Doses e drinks
    ("Dose Barril Saborizada", "Doses e Drinks", "4.00", "un", True, "Dose de barril saborizada."),
    ("Dose Cachaça", "Doses e Drinks", "3.00", "un", True, "Dose de cachaça."),
    ("Dose Campari", "Doses e Drinks", "12.00", "un", True, "Dose de Campari."),
    ("Dose Bacardi", "Doses e Drinks", "10.00", "un", True, "Dose de Bacardi."),
    ("Dose Presidente", "Doses e Drinks", "5.00", "un", True, "Dose de Presidente."),
    ("Dose Vodka", "Doses e Drinks", "12.00", "un", True, "Dose de vodka."),
    ("Dose Gin", "Doses e Drinks", "10.00", "un", True, "Dose de gin."),
    ("Dose Montilla", "Doses e Drinks", "10.00", "un", True, "Dose de Montilla."),
    ("Dose Cortezano", "Doses e Drinks", "10.00", "un", True, "Dose de Cortezano."),
    ("Dose Albin", "Doses e Drinks", "8.00", "un", True, "Dose de Albin."),
    ("Caipirinha", "Doses e Drinks", "12.00", "un", True, "Caipirinha tradicional."),
    ("Caipivodka", "Doses e Drinks", "14.00", "un", True, "Caipirinha feita com vodka."),
    # Porções e petiscos
    ("Filé de Tilápia", "Porções e Petiscos", "50.00", "porcao", True, "Porção de filé de tilápia."),
    ("Tilápia com Espinho", "Porções e Petiscos", "50.00", "porcao", False, "Tilápia com espinho. Sem estoque no momento."),
    ("Batata com Bacon e Mussarela", "Porções e Petiscos", "30.00", "porcao", True, "Porção de batata com bacon e mussarela."),
    ("Batata Frita Simples", "Porções e Petiscos", "18.00", "porcao", True, "Porção de batata frita simples."),
    ("Bolinho de Tilápia", "Porções e Petiscos", "45.00", "porcao", True, "Porção de bolinho de tilápia."),
    ("Bolinho de Camarão", "Porções e Petiscos", "65.00", "porcao", True, "Porção de bolinho de camarão."),
    ("Porção de Bananinha", "Porções e Petiscos", "7.00", "porcao", True, "Porção de bananinha."),
    ("Banana com Sal e Alho", "Porções e Petiscos", "10.00", "porcao", True, "Porção de banana com sal e alho."),
    # Combos
    ("Combo Carne de Boi com Batata", "Combos", "75.00", "porcao", True, "Combo de carne de boi com batata."),
    ("Combo Carne de Porco com Batata", "Combos", "60.00", "porcao", True, "Combo de carne de porco com batata."),
    ("Porção de Boi Simples", "Combos", "60.00", "porcao", True, "Porção simples de carne de boi."),
    ("Porção de Porco", "Combos", "50.00", "porcao", True, "Porção de carne de porco."),
    # Almoço
    ("Almoço de Sábado (por pessoa)", "Almoço", "15.00", "un", True, "Almoço servido somente aos sábados. Valor por pessoa."),
    # Extras
    ("Saco de Carvão", "Extras", "18.00", "un", True, "Saco de carvão."),
    ("Gomas", "Extras", "6.00", "un", True, "Pacote de gomas."),
    ("Pipoca", "Extras", "6.00", "un", True, "Pipoca."),
]


def aplicar(apps, schema_editor):
    alias = schema_editor.connection.alias
    Categoria = apps.get_model("core", "CategoriaCardapio")
    Item = apps.get_model("core", "ItemCardapio")
    Mesa = apps.get_model("core", "Mesa")

    categorias = {}
    for nome, icone, ordem in CATEGORIAS:
        categoria, criada = Categoria.objects.using(alias).get_or_create(
            nome=nome, defaults={"icone": icone, "ordem": ordem}
        )
        if not criada and (categoria.icone != icone or categoria.ordem != ordem):
            categoria.icone = icone
            categoria.ordem = ordem
            categoria.save(update_fields=["icone", "ordem"])
        categorias[nome] = categoria

    for nome, categoria_nome, preco, unidade, disponivel, descricao in ITENS:
        categoria = categorias[categoria_nome]
        item = Item.objects.using(alias).filter(nome=nome).first()
        if item:
            item.categoria = categoria
            item.preco = Decimal(preco)
            item.unidade = unidade
            item.disponivel = disponivel
            if descricao and not item.descricao:
                item.descricao = descricao
            if not item.imagem_alt:
                item.imagem_alt = f"Foto ilustrativa: {nome}"
            item.save(update_fields=["categoria", "preco", "unidade", "disponivel", "descricao", "imagem_alt"])
        else:
            Item.objects.using(alias).create(
                categoria=categoria,
                nome=nome,
                descricao=descricao,
                preco=Decimal(preco),
                unidade=unidade,
                disponivel=disponivel,
                imagem_alt=f"Foto ilustrativa: {nome}",
            )

    # Troca as mesas por quiosques do 1 ao 15.
    # Não apaga registros (comandas usam PROTECT); quiosques fora da faixa
    # são apenas desativados para preservar o histórico.
    for numero in range(1, 16):
        mesa, criada = Mesa.objects.using(alias).get_or_create(
            numero=numero,
            defaults={"capacidade": 6, "localizacao": f"Quiosque {numero}", "ativa": True},
        )
        if not criada and (mesa.localizacao != f"Quiosque {numero}" or not mesa.ativa):
            mesa.localizacao = f"Quiosque {numero}"
            mesa.ativa = True
            mesa.save(update_fields=["localizacao", "ativa"])
    Mesa.objects.using(alias).filter(numero__gt=15).update(ativa=False)


def reverter(apps, schema_editor):
    # Reversão segura: reativa mesas desativadas; mantém o cardápio novo
    # para não apagar histórico de itens/comandas.
    alias = schema_editor.connection.alias
    Mesa = apps.get_model("core", "Mesa")
    Mesa.objects.using(alias).filter(numero__gt=15).update(ativa=True)


class Migration(migrations.Migration):
    dependencies = [("core", "0011_ensure_default_admin")]
    operations = [migrations.RunPython(aplicar, reverter)]
