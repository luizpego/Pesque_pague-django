from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.db import models


class Usuario(AbstractUser):
    """Usuário do sistema. Pode ser cliente, garçom/atendente ou gerente."""

    class Papel(models.TextChoices):
        CLIENTE = "cliente", "Cliente"
        GARCOM = "garcom", "Garçom / Atendente"
        COZINHA = "cozinha", "Cozinha"
        GERENTE = "gerente", "Gerente"

    papel = models.CharField(
        max_length=10, choices=Papel.choices, default=Papel.CLIENTE
    )
    telefone = models.CharField(max_length=20, blank=True)
    # Preferência de acessibilidade salva no perfil, aplicada automaticamente no login
    preferencia_alto_contraste = models.BooleanField(default=False)
    preferencia_fonte_grande = models.BooleanField(default=False)

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def is_staff_operacional(self):
        return self.papel in {self.Papel.GARCOM, self.Papel.COZINHA, self.Papel.GERENTE}


class Mesa(models.Model):
    """Mesa física do salão (ou 'lago' — cada ponto de pesca também vira uma mesa)."""

    numero = models.PositiveIntegerField(unique=True)
    capacidade = models.PositiveSmallIntegerField(default=4)
    ativa = models.BooleanField(default=True)
    localizacao = models.CharField(
        max_length=100,
        blank=True,
        help_text="Ex.: Lago 1, Deck coberto, Varanda",
    )

    class Meta:
        ordering = ["numero"]
        verbose_name = "Mesa"
        verbose_name_plural = "Mesas"

    def __str__(self):
        return f"Mesa {self.numero}"


class CategoriaCardapio(models.Model):
    """Categorias do cardápio: Peixes, Acompanhamentos, Bebidas, Sobremesas..."""

    nome = models.CharField(max_length=60, unique=True)
    ordem = models.PositiveSmallIntegerField(default=0)
    icone = models.CharField(
        max_length=10,
        default="🐟",
        help_text="Emoji usado como ícone no cardápio (tema de pescaria)",
    )

    class Meta:
        ordering = ["ordem", "nome"]
        verbose_name = "Categoria do cardápio"
        verbose_name_plural = "Categorias do cardápio"

    def __str__(self):
        return self.nome


class ItemCardapio(models.Model):
    """Um item vendável: peixe pescado por quilo, prato pronto, bebida etc."""

    class Unidade(models.TextChoices):
        UNIDADE = "un", "Unidade"
        QUILO = "kg", "Quilo"
        PORCAO = "porcao", "Porção"

    categoria = models.ForeignKey(
        CategoriaCardapio, on_delete=models.PROTECT, related_name="itens"
    )
    nome = models.CharField(max_length=120)
    descricao = models.TextField(blank=True)
    imagem = models.ImageField(upload_to="cardapio/", blank=True, null=True)
    preco = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0)])
    unidade = models.CharField(max_length=10, choices=Unidade.choices, default=Unidade.UNIDADE)
    disponivel = models.BooleanField(default=True)
    eh_pescado_no_local = models.BooleanField(
        default=False, help_text="Marque para peixes pescados pelo próprio cliente no local"
    )
    tempo_preparo_min = models.PositiveSmallIntegerField(default=15)
    # Texto alternativo acessível, usado no <img alt="..."> do front
    imagem_alt = models.CharField(
        max_length=200,
        blank=True,
        help_text="Descrição da imagem para leitores de tela",
    )

    class Meta:
        ordering = ["categoria__ordem", "nome"]
        verbose_name = "Item do cardápio"
        verbose_name_plural = "Itens do cardápio"

    def __str__(self):
        return self.nome


class Comanda(models.Model):
    """A comanda/carrinho de uma mesa: reúne os pedidos até o fechamento da conta."""

    class Status(models.TextChoices):
        ABERTA = "aberta", "Aberta"
        ENVIADA = "enviada", "Enviada à cozinha"
        EM_PREPARO = "em_preparo", "Em preparo"
        PRONTA = "pronta", "Pronta para entrega"
        ENTREGUE = "entregue", "Entregue"
        FECHADA = "fechada", "Fechada / Paga"
        CANCELADA = "cancelada", "Cancelada"

    mesa = models.ForeignKey(Mesa, on_delete=models.PROTECT, related_name="comandas")
    cliente = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="comandas"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ABERTA)
    observacoes = models.TextField(blank=True)
    criada_em = models.DateTimeField(auto_now_add=True)
    atualizada_em = models.DateTimeField(auto_now=True)
    # Pagamento é controlado à parte do fluxo de cozinha: no pesque-pague o
    # cliente pode pagar antes, durante ou depois de comer.
    pago = models.BooleanField(default=False)
    pago_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-criada_em"]
        verbose_name = "Comanda"
        verbose_name_plural = "Comandas"

    def __str__(self):
        return f"Comanda #{self.pk} - {self.mesa}"

    @property
    def total(self):
        return sum((item.subtotal for item in self.itens.all()), start=0)


class ItemComanda(models.Model):
    """Um item lançado dentro de uma comanda (linha do carrinho)."""

    comanda = models.ForeignKey(Comanda, on_delete=models.CASCADE, related_name="itens")
    item_cardapio = models.ForeignKey(ItemCardapio, on_delete=models.PROTECT)
    quantidade = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    preco_unitario = models.DecimalField(max_digits=8, decimal_places=2)
    observacoes = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = "Item da comanda"
        verbose_name_plural = "Itens da comanda"

    def save(self, *args, **kwargs):
        if not self.preco_unitario:
            self.preco_unitario = self.item_cardapio.preco
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantidade}x {self.item_cardapio.nome}"

    @property
    def subtotal(self):
        return self.quantidade * self.preco_unitario


class Pagamento(models.Model):
    """
    Um pagamento via Pix gerado pelo Mercado Pago para uma comanda.
    Uma comanda pode ter mais de um registro caso o cliente gere um novo
    QR Code (ex.: o anterior expirou).
    """

    class Status(models.TextChoices):
        PENDENTE = "pending", "Aguardando pagamento"
        EM_PROCESSO = "in_process", "Em processamento"
        APROVADO = "approved", "Aprovado"
        REJEITADO = "rejected", "Rejeitado"
        CANCELADO = "cancelled", "Cancelado"

    comanda = models.ForeignKey(Comanda, on_delete=models.CASCADE, related_name="pagamentos")
    mercado_pago_id = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDENTE)
    valor = models.DecimalField(max_digits=10, decimal_places=2)
    # Código Pix "copia e cola"
    qr_code = models.TextField(blank=True)
    # Imagem do QR Code já em base64, pronta para exibir num <img>
    qr_code_base64 = models.TextField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Pagamento"
        verbose_name_plural = "Pagamentos"

    def __str__(self):
        return f"Pagamento {self.mercado_pago_id} ({self.status}) - Comanda #{self.comanda_id}"
