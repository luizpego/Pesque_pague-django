"""Gestão operacional reutilizando catálogo, usuários e pagamentos existentes."""
import json
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.forms.models import model_to_dict
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from . import atendimento as regras, estoque
from .atendimento_views import inteiro_filtro, periodo, validar
from .models import (AuditoriaAdministrativa, Comanda, ConfiguracaoEstabelecimento,
    HorarioFuncionamento, ImagemGaleria, ItemCardapio, Mesa, MetaDiaria, MovimentoEstoque,
    Pagamento, Pedido, Reserva, SessaoCaixa, Usuario)
from .permissions import EhGerente
from .serializers import (ConfiguracaoEstabelecimentoSerializer, HorarioFuncionamentoSerializer,
    ImagemGaleriaSerializer)


def snapshot(obj):
    return json.loads(json.dumps({k: v for k, v in model_to_dict(obj).items()
        if k not in {"password", "vinculo_token", "chave"}}, default=str))


def auditar(usuario, acao, obj, dados=None):
    AuditoriaAdministrativa.objects.create(usuario=usuario, usuario_nome=usuario.username,
        acao=acao, entidade=obj._meta.label, identificador=str(obj.pk), dados=dados or {})


class AuditavelMixin:
    @transaction.atomic
    def perform_create(self, serializer):
        obj = serializer.save()
        auditar(self.request.user, "cadastro", obj, {"depois": snapshot(obj)})

    @transaction.atomic
    def perform_update(self, serializer):
        obj = type(serializer.instance).objects.select_for_update().get(pk=serializer.instance.pk)
        antes = snapshot(obj)
        serializer.instance = obj
        obj = serializer.save()
        auditar(self.request.user, "alteracao", obj, {"antes": antes, "depois": snapshot(obj)})


class CadastroGestaoViewSet(AuditavelMixin, viewsets.ModelViewSet):
    permission_classes = [EhGerente]
    http_method_names = ["get", "post", "patch", "head", "options"]


class ConfiguracaoViewSet(CadastroGestaoViewSet):
    queryset = ConfiguracaoEstabelecimento.objects.order_by("pk")
    serializer_class = ConfiguracaoEstabelecimentoSerializer

    def perform_create(self, serializer):
        if ConfiguracaoEstabelecimento.objects.exists():
            raise ValidationError("Edite a configuração já existente.")
        super().perform_create(serializer)


class HorarioViewSet(CadastroGestaoViewSet):
    queryset = HorarioFuncionamento.objects.all()
    serializer_class = HorarioFuncionamentoSerializer


class GaleriaViewSet(CadastroGestaoViewSet):
    queryset = ImagemGaleria.objects.all()
    serializer_class = ImagemGaleriaSerializer


class UsuarioGestaoSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Usuario
        fields = ["id", "username", "first_name", "last_name", "email", "telefone", "papel", "is_active", "is_superuser", "password"]
        read_only_fields = ["is_superuser"]

    def validate(self, data):
        password = data.get("password")
        if not self.instance and not password:
            raise ValidationError({"password": "Informe uma senha."})
        if password:
            validate_password(password, self.instance or Usuario(username=data.get("username", ""), email=data.get("email", "")))
        if self.instance:
            if self.instance.is_superuser and self.context["request"].user != self.instance:
                raise ValidationError("Uma conta de superusuário só pode ser editada pelo próprio titular.")
            if self.instance.pk == self.context["request"].user.pk and (data.get("is_active") is False or data.get("papel", self.instance.papel) != self.instance.papel):
                raise ValidationError("Não remova seu próprio acesso administrativo.")
        return data

    def create(self, data):
        return Usuario.objects.create_user(**data)

    def update(self, instance, data):
        password = data.pop("password", None)
        obj = super().update(instance, data)
        if password:
            obj.set_password(password)
            obj.save(update_fields=["password"])
        return obj


class UsuarioGestaoViewSet(CadastroGestaoViewSet):
    queryset = Usuario.objects.order_by("username")
    serializer_class = UsuarioGestaoSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("busca"):
            qs = qs.filter(username__icontains=self.request.query_params["busca"])
        return qs


class EstoqueSerializer(serializers.ModelSerializer):
    status_estoque = serializers.SerializerMethodField()

    class Meta:
        model = ItemCardapio
        fields = ["id", "nome", "unidade", "disponivel", "controla_estoque", "estoque_atual", "estoque_minimo", "status_estoque"]
        read_only_fields = fields

    def get_status_estoque(self, obj):
        if not obj.controla_estoque:
            return "sem_controle"
        return "sem_estoque" if obj.estoque_atual <= 0 else "baixo" if obj.estoque_atual <= obj.estoque_minimo else "bom"


class AjusteEstoqueSerializer(serializers.Serializer):
    quantidade = serializers.DecimalField(max_digits=12, decimal_places=2)
    saldo_esperado = serializers.DecimalField(max_digits=12, decimal_places=2)
    minimo = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    controlar = serializers.BooleanField()
    motivo = serializers.CharField(min_length=5, max_length=500)


class MovimentoSerializer(serializers.ModelSerializer):
    funcionario = serializers.CharField(source="usuario.username", default="", read_only=True)
    produto_nome = serializers.CharField(source="produto.nome", read_only=True)

    class Meta:
        model = MovimentoEstoque
        fields = ["id", "produto", "produto_nome", "quantidade", "saldo", "tipo", "criado_em", "funcionario", "pedido", "motivo"]


class EstoqueViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [EhGerente]
    queryset = ItemCardapio.objects.order_by("nome", "id")
    serializer_class = EstoqueSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("busca"):
            qs = qs.filter(nome__icontains=self.request.query_params["busca"])
        return qs

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def ajustar(self, request, pk=None):
        dados = validar(AjusteEstoqueSerializer, request.data)
        produto = get_object_or_404(ItemCardapio.objects.select_for_update(), pk=pk)
        chave = request.headers.get("Idempotency-Key")
        anterior, assinatura = regras.idempotencia(request.user, f"estoque:{pk}", chave, dados)
        if anterior:
            return Response(EstoqueSerializer(produto).data)
        if produto.estoque_atual != dados["saldo_esperado"]:
            raise regras.Conflito("O saldo mudou. Atualize o estoque antes de ajustar.")
        produto.controla_estoque = dados["controlar"]
        produto.estoque_minimo = dados["minimo"]
        produto.save(update_fields=["controla_estoque", "estoque_minimo"])
        estoque.movimentar(produto, dados["quantidade"], request.user, "ajuste", dados["motivo"])
        auditar(request.user, "configuracao_estoque", produto, {"controlar": dados["controlar"], "minimo": str(dados["minimo"]), "motivo": dados["motivo"]})
        regras.registrar_chave(request.user, f"estoque:{pk}", chave, assinatura, produto.pk)
        return Response(EstoqueSerializer(produto).data)

    @action(detail=False, methods=["get"])
    def movimentos(self, request):
        qs = MovimentoEstoque.objects.select_related("usuario", "produto")
        produto = inteiro_filtro(request.query_params, "produto")
        if produto:
            qs = qs.filter(produto_id=produto)
        return self.get_paginated_response(MovimentoSerializer(self.paginate_queryset(qs), many=True).data)


class CaixaSerializer(serializers.ModelSerializer):
    aberta_por_nome = serializers.CharField(source="aberta_por.username", default="", read_only=True)
    fechada_por_nome = serializers.CharField(source="fechada_por.username", default="", read_only=True)
    resumo = serializers.SerializerMethodField()

    class Meta:
        model = SessaoCaixa
        fields = ["id", "aberta_em", "fechada_em", "aberta_por_nome", "fechada_por_nome", "valor_inicial", "dinheiro_contado", "observacoes", "resumo"]

    def get_resumo(self, obj):
        formas = {k: Decimal("0.00") for k in Pagamento.Forma.values}
        for p in obj.pagamentos.all():
            if p.status == "approved":
                formas[p.forma] += p.valor
        esperado = obj.valor_inicial + formas["dinheiro"]
        return {"formas": {k: str(v) for k, v in formas.items()}, "total_recebido": str(sum(formas.values())),
            "dinheiro_esperado": str(esperado), "diferenca": str(obj.dinheiro_contado - esperado) if obj.dinheiro_contado is not None else None}


class AbrirCaixaSerializer(serializers.Serializer):
    valor_inicial = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))


class FecharCaixaSerializer(serializers.Serializer):
    dinheiro_contado = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    observacoes = serializers.CharField(max_length=500, allow_blank=True, default="")


class CaixaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SessaoCaixa.objects.select_related("aberta_por", "fechada_por").prefetch_related("pagamentos")
    serializer_class = CaixaSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        regras.permitir(request.user, {"caixa", "gerente"})

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def abrir(self, request):
        dados = validar(AbrirCaixaSerializer, request.data)
        Usuario.objects.select_for_update().get(pk=request.user.pk)
        chave = request.headers.get("Idempotency-Key")
        anterior, assinatura = regras.idempotencia(request.user, "abrir_caixa", chave, dados)
        if anterior:
            return Response(CaixaSerializer(self.get_queryset().get(pk=anterior.resultado_id)).data)
        try:
            with transaction.atomic():
                caixa = SessaoCaixa.objects.create(aberta_por=request.user, **dados)
        except IntegrityError:
            raise regras.Conflito("Já existe um caixa aberto.")
        regras.registrar_chave(request.user, "abrir_caixa", chave, assinatura, caixa.pk)
        auditar(request.user, "abertura_caixa", caixa, snapshot(caixa))
        return Response(CaixaSerializer(caixa).data, status=201)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def fechar(self, request, pk=None):
        dados = validar(FecharCaixaSerializer, request.data)
        caixa = get_object_or_404(SessaoCaixa.objects.select_for_update(), pk=pk)
        chave = request.headers.get("Idempotency-Key")
        anterior, assinatura = regras.idempotencia(request.user, f"fechar_caixa:{pk}", chave, dados)
        if anterior:
            return Response(CaixaSerializer(caixa).data)
        if caixa.fechada_em:
            raise ValidationError("Este caixa já foi fechado.")
        caixa.fechada_em, caixa.fechada_por = timezone.now(), request.user
        caixa.dinheiro_contado = dados["dinheiro_contado"]
        caixa.observacoes = dados["observacoes"]
        caixa.save()
        regras.registrar_chave(request.user, f"fechar_caixa:{pk}", chave, assinatura, caixa.pk)
        auditar(request.user, "fechamento_caixa", caixa, snapshot(caixa))
        return Response(CaixaSerializer(caixa).data)

    @action(detail=True, methods=["get"])
    def movimentos(self, request, pk=None):
        caixa = self.get_object()
        qs = caixa.pagamentos.select_related("registrado_por").order_by("-criado_em", "-id")
        dados = [{"id": p.pk, "comanda": p.comanda_id, "valor": str(p.valor), "forma": p.forma,
            "status": p.status, "criado_em": p.criado_em, "funcionario": p.registrado_por.username if p.registrado_por else ""} for p in self.paginate_queryset(qs)]
        return self.get_paginated_response(dados)


class ReservaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserva
        fields = ["id", "nome", "telefone", "data", "horario", "pessoas", "observacao", "status", "criada_em", "atualizada_em"]
        read_only_fields = ["criada_em", "atualizada_em"]
        extra_kwargs = {"pessoas": {"min_value": 1, "max_value": 500}}

    def validate_telefone(self, value):
        digitos = "".join(c for c in value if c.isdecimal())
        if not 10 <= len(digitos) <= 15:
            raise ValidationError("Informe um telefone válido, com DDD.")
        return value

    def validate(self, data):
        if not self.instance or data.get("data", self.instance.data) != self.instance.data or data.get("horario", self.instance.horario) != self.instance.horario:
            dia = data.get("data", getattr(self.instance, "data", None))
            hora = data.get("horario", getattr(self.instance, "horario", None))
            if dia and hora and timezone.make_aware(datetime.combine(dia, hora)) < timezone.now():
                raise ValidationError("Escolha uma data e horário futuros.")
            if dia and dia > timezone.localdate() + timedelta(days=366):
                raise ValidationError("Reserve com até um ano de antecedência.")
        return data


class ReservaViewSet(CadastroGestaoViewSet):
    queryset = Reserva.objects.all()
    serializer_class = ReservaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("data"):
            dia = serializers.DateField().run_validation(self.request.query_params["data"])
            qs = qs.filter(data=dia)
        return qs

    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny], authentication_classes=[], throttle_classes=[ScopedRateThrottle])
    def solicitar(self, request):
        dados = validar(ReservaSerializer, {k: v for k, v in request.data.items() if k != "status"})
        chave = serializers.UUIDField().run_validation(request.headers.get("Idempotency-Key"))
        reserva, criada = Reserva.objects.get_or_create(chave=chave, defaults={**dados, "status": "pendente"})
        return Response({"protocolo": reserva.id, "status": "pendente"}, status=201 if criada else 200)

    def get_throttles(self):
        if self.action == "solicitar":
            self.throttle_scope = "reservas"
        return super().get_throttles()


class MetaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetaDiaria
        fields = ["id", "data", "valor"]


class MetaViewSet(CadastroGestaoViewSet):
    queryset = MetaDiaria.objects.all()
    serializer_class = MetaSerializer


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = [EhGerente]

    def list(self, request):
        hoje = timezone.localdate()
        vendas = Comanda.objects.filter(status="fechada", pago=True, fechada_em__date=hoje)
        vendido = vendas.aggregate(total=Sum("total_fechamento"))["total"] or Decimal("0.00")
        meta = MetaDiaria.objects.filter(data=hoje).first()
        ocupadas = Mesa.objects.filter(ativa=True, comandas__in=Comanda.objects.exclude(status__in=["fechada", "cancelada"])).distinct().count()
        estados = {p["status"]: p["n"] for p in Pedido.objects.exclude(comanda__status__in=["fechada", "cancelada"]).values("status").annotate(n=Count("id"))}
        estoque_baixo = ItemCardapio.objects.filter(controla_estoque=True, estoque_atual__gt=0)
        from django.db.models import F
        return Response({"vendas": str(vendido), "meta": str(meta.valor) if meta else None,
            "percentual": str((vendido / meta.valor * 100).quantize(Decimal("0.01"))) if meta else None,
            "atingida": bool(meta and vendido >= meta.valor), "mesas_ocupadas": ocupadas,
            "mesas_livres": Mesa.objects.filter(ativa=True).count() - ocupadas,
            "pedidos_novos": estados.get("recebido", 0), "pedidos_preparando": estados.get("preparando", 0),
            "pedidos_prontos": estados.get("pronto", 0), "estoque_baixo": estoque_baixo.filter(estoque_atual__lte=F("estoque_minimo")).count(),
            "estoque_esgotado": ItemCardapio.objects.filter(controla_estoque=True, estoque_atual=0).count(),
            "reservas": Reserva.objects.filter(data=hoje).exclude(status="cancelada").count()})
