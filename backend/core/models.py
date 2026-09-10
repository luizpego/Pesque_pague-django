from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
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
    """Mesa física do salão do restaurante."""

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
    """Produto do restaurante: prato pronto, porção, bebida ou sobremesa."""

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
    preco = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
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
        FECHADA = "fechada", "Fechada"
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


class ConfiguracaoEstabelecimento(models.Model):
    """Informações públicas editáveis pelo Django Admin."""

    nome = models.CharField(max_length=120, default="Pesque & Pague")
    descricao_restaurante = models.TextField(blank=True)
    descricao_pesque_pague = models.TextField(blank=True)
    telefone = models.CharField(max_length=30, blank=True)
    whatsapp = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    endereco = models.CharField(max_length=240, blank=True)
    link_mapa = models.URLField(blank=True)
    aviso_importante = models.CharField(max_length=240, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração do estabelecimento"
        verbose_name_plural = "Configuração do estabelecimento"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nome


class HorarioFuncionamento(models.Model):
    class DiaSemana(models.IntegerChoices):
        SEGUNDA = 0, "Segunda-feira"
        TERCA = 1, "Terça-feira"
        QUARTA = 2, "Quarta-feira"
        QUINTA = 3, "Quinta-feira"
        SEXTA = 4, "Sexta-feira"
        SABADO = 5, "Sábado"
        DOMINGO = 6, "Domingo"

    dia_semana = models.PositiveSmallIntegerField(choices=DiaSemana.choices, unique=True)
    abre_as = models.TimeField(null=True, blank=True)
    fecha_as = models.TimeField(null=True, blank=True)
    fechado = models.BooleanField(default=False)
    observacao = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["dia_semana"]
        verbose_name = "Horário de funcionamento"
        verbose_name_plural = "Horários de funcionamento"

    def clean(self):
        if not self.fechado and (self.abre_as is None or self.fecha_as is None):
            raise ValidationError("Informe abertura e fechamento ou marque o dia como fechado.")

    def __str__(self):
        return self.get_dia_semana_display()


class LagoPesca(models.Model):
    class Modalidade(models.TextChoices):
        PESQUE_PAGUE = "pesque_pague", "Pesque-pague"
        ESPORTIVA = "esportiva", "Pesca esportiva"
        MISTA = "mista", "Pesque-pague e esportiva"

    nome = models.CharField(max_length=100, unique=True)
    descricao = models.TextField(blank=True)
    modalidade = models.CharField(max_length=20, choices=Modalidade.choices)
    valor_diaria = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    capacidade = models.PositiveSmallIntegerField(null=True, blank=True)
    disponivel = models.BooleanField(default=True)
    imagem = models.ImageField(upload_to="pesca/lagos/", blank=True, null=True)
    imagem_alt = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["nome"]
        verbose_name = "Lago de pesca"
        verbose_name_plural = "Lagos de pesca"

    def __str__(self):
        return self.nome


class EspeciePeixe(models.Model):
    nome = models.CharField(max_length=100, unique=True)
    descricao = models.TextField(blank=True)
    preco_quilo = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    disponivel = models.BooleanField(default=True)
    imagem = models.ImageField(upload_to="pesca/especies/", blank=True, null=True)
    imagem_alt = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["nome"]
        verbose_name = "Espécie de peixe"
        verbose_name_plural = "Espécies de peixe"

    def __str__(self):
        return self.nome


class RegraPesca(models.Model):
    titulo = models.CharField(max_length=120)
    descricao = models.TextField()
    ordem = models.PositiveSmallIntegerField(default=0)
    ativa = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "titulo"]
        verbose_name = "Regra de pesca"
        verbose_name_plural = "Regras de pesca"

    def __str__(self):
        return self.titulo


class ServicoPesca(models.Model):
    class Tipo(models.TextChoices):
        SERVICO = "servico", "Serviço"
        EQUIPAMENTO = "equipamento", "Equipamento"

    nome = models.CharField(max_length=120)
    descricao = models.TextField(blank=True)
    tipo = models.CharField(max_length=15, choices=Tipo.choices, default=Tipo.SERVICO)
    valor = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    disponivel = models.BooleanField(default=True)

    class Meta:
        ordering = ["tipo", "nome"]
        verbose_name = "Serviço de pesca"
        verbose_name_plural = "Serviços de pesca"

    def __str__(self):
        return self.nome


class ImagemGaleria(models.Model):
    class Area(models.TextChoices):
        RESTAURANTE = "restaurante", "Restaurante"
        PESCA = "pesca", "Pesque-pague"

    area = models.CharField(max_length=15, choices=Area.choices)
    titulo = models.CharField(max_length=120, blank=True)
    imagem = models.ImageField(upload_to="galeria/")
    imagem_alt = models.CharField(max_length=200)
    ordem = models.PositiveSmallIntegerField(default=0)
    ativa = models.BooleanField(default=True)

    class Meta:
        ordering = ["area", "ordem", "id"]
        verbose_name = "Imagem da galeria"
        verbose_name_plural = "Imagens da galeria"

    def __str__(self):
        return self.titulo or self.imagem_alt


class RegistroPesca(models.Model):
    class Modalidade(models.TextChoices):
        PESQUE_PAGUE = "pesque_pague", "Pesque-pague"
        ESPORTIVA = "esportiva", "Pesca esportiva"
        DIARIA = "diaria", "Diária"

    class Status(models.TextChoices):
        ABERTO = "aberto", "Em andamento"
        ENCERRADO = "encerrado", "Encerrado"
        CANCELADO = "cancelado", "Cancelado"

    pescador_nome = models.CharField(max_length=120)
    telefone = models.CharField(max_length=30, blank=True)
    lago = models.ForeignKey(LagoPesca, on_delete=models.PROTECT, related_name="registros")
    modalidade = models.CharField(max_length=20, choices=Modalidade.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ABERTO)
    valor_entrada = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    observacoes = models.TextField(blank=True)
    entrada_em = models.DateTimeField(auto_now_add=True)
    saida_em = models.DateTimeField(null=True, blank=True)
    responsavel_entrada = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="registros_pesca_abertos",
    )

    class Meta:
        ordering = ["-entrada_em"]
        verbose_name = "Registro de pesca"
        verbose_name_plural = "Registros de pesca"

    @property
    def peso_total_kg(self):
        return sum((captura.peso_kg for captura in self.capturas.all()), start=Decimal("0"))

    @property
    def total(self):
        capturas = sum((captura.total for captura in self.capturas.all()), start=Decimal("0"))
        return self.valor_entrada + capturas

    def __str__(self):
        return f"Registro #{self.pk} - {self.pescador_nome}"


class CapturaPesca(models.Model):
    registro = models.ForeignKey(RegistroPesca, on_delete=models.CASCADE, related_name="capturas")
    especie = models.ForeignKey(EspeciePeixe, on_delete=models.PROTECT, related_name="capturas")
    peso_kg = models.DecimalField(
        max_digits=7,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    preco_quilo = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    observacoes = models.CharField(max_length=200, blank=True)
    registrado_em = models.DateTimeField(auto_now_add=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="capturas_registradas",
    )

    class Meta:
        ordering = ["registrado_em"]
        verbose_name = "Pesagem de peixe"
        verbose_name_plural = "Pesagens de peixe"

    @property
    def total(self):
        return self.peso_kg * self.preco_quilo

    def __str__(self):
        return f"{self.especie} - {self.peso_kg} kg"


class ImpressaoDocumento(models.Model):
    class TipoDocumento(models.TextChoices):
        COMANDA_CLIENTE = "comanda_cliente", "Comanda do cliente"
        COZINHA = "cozinha", "Via da cozinha"
        BALCAO = "balcao", "Via do balcão"
        RESUMO_MESA = "resumo_mesa", "Resumo da mesa"
        REGISTRO_PESCA = "registro_pesca", "Registro do pesque-pague"
        COMPROVANTE_PESCA = "comprovante_pesca", "Comprovante do pesque-pague"
        FECHAMENTO = "fechamento", "Fechamento da operação"

    class Status(models.TextChoices):
        GERADO = "gerado", "Gerado"
        SOLICITADO = "solicitado", "Solicitado para impressão"
        REIMPRESSO = "reimpresso", "Reimpresso"

    tipo_documento = models.CharField(max_length=24, choices=TipoDocumento.choices)
    comanda = models.ForeignKey(
        Comanda,
        on_delete=models.CASCADE,
        related_name="documentos_impressao",
        null=True,
        blank=True,
    )
    registro_pesca = models.ForeignKey(
        RegistroPesca,
        on_delete=models.CASCADE,
        related_name="documentos_impressao",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.GERADO)
    quantidade_solicitacoes = models.PositiveIntegerField(default=0)
    gerado_em = models.DateTimeField(auto_now_add=True)
    ultima_solicitacao_em = models.DateTimeField(null=True, blank=True)
    gerado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="documentos_gerados",
    )

    class Meta:
        ordering = ["-gerado_em"]
        constraints = [
            models.UniqueConstraint(
                fields=["tipo_documento", "comanda"],
                condition=models.Q(comanda__isnull=False),
                name="impressao_tipo_comanda_unica",
            ),
            models.UniqueConstraint(
                fields=["tipo_documento", "registro_pesca"],
                condition=models.Q(registro_pesca__isnull=False),
                name="impressao_tipo_pesca_unica",
            ),
        ]
        verbose_name = "Documento para impressão"
        verbose_name_plural = "Documentos para impressão"

    def clean(self):
        if bool(self.comanda_id) == bool(self.registro_pesca_id):
            raise ValidationError("Vincule o documento a uma comanda ou a um registro de pesca.")

    def __str__(self):
        origem = self.comanda or self.registro_pesca
        return f"{self.get_tipo_documento_display()} - {origem}"
