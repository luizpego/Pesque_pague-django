from decimal import Decimal, InvalidOperation
import hashlib
import hmac
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
import requests
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import (
    CapturaPesca,
    CategoriaCardapio,
    Comanda,
    ConfiguracaoEstabelecimento,
    EspeciePeixe,
    HorarioFuncionamento,
    ImagemGaleria,
    ImpressaoDocumento,
    ItemCardapio,
    ItemComanda,
    LagoPesca,
    Mesa,
    Pagamento,
    RegistroPesca,
    RegraPesca,
    ServicoPesca,
)
from .pagamentos import MercadoPagoNaoConfiguradoError, atualizar_status_pagamento, criar_pagamento_pix
from .permissions import ComandaEhDoClienteOuStaff, EhStaffOperacional
from .serializers import (
    CategoriaCardapioSerializer,
    ConfiguracaoEstabelecimentoSerializer,
    EspeciePeixeSerializer,
    HorarioFuncionamentoSerializer,
    ImagemGaleriaSerializer,
    ImpressaoDocumentoSerializer,
    ComandaSerializer,
    CapturaPescaSerializer,
    ItemCardapioSerializer,
    ItemComandaSerializer,
    LagoPescaSerializer,
    MesaSerializer,
    PagamentoSerializer,
    RegistroPescaSerializer,
    RegraPescaSerializer,
    RegistroSerializer,
    ServicoPescaSerializer,
    UsuarioSerializer,
)

Usuario = get_user_model()


class LoginView(TokenObtainPairView):
    throttle_scope = "auth"


class RenovarTokenView(TokenRefreshView):
    throttle_scope = "token_refresh"


def exigir_pedidos_ativos():
    if not settings.ORDERS_ENABLED:
        raise PermissionDenied("Pedidos ainda não estão liberados neste site.")


def exigir_pagamentos_online_ativos():
    if not settings.ONLINE_PAYMENTS_ENABLED:
        raise PermissionDenied("O pagamento online está temporariamente desativado.")


TIPOS_COMANDA_CLIENTE = {
    ImpressaoDocumento.TipoDocumento.COMANDA_CLIENTE,
    ImpressaoDocumento.TipoDocumento.RESUMO_MESA,
}
TIPOS_COMANDA_STAFF = TIPOS_COMANDA_CLIENTE | {
    ImpressaoDocumento.TipoDocumento.COZINHA,
    ImpressaoDocumento.TipoDocumento.BALCAO,
}
TIPOS_PESCA = {
    ImpressaoDocumento.TipoDocumento.REGISTRO_PESCA,
    ImpressaoDocumento.TipoDocumento.COMPROVANTE_PESCA,
    ImpressaoDocumento.TipoDocumento.FECHAMENTO,
}


def obter_tipo_documento(request, permitidos):
    tipo = request.data.get("tipo_documento")
    if tipo not in permitidos:
        raise ValidationError({"tipo_documento": "Tipo de documento inválido para esta operação."})
    return tipo


def obter_ou_gerar_documento(*, usuario, tipo, comanda=None, registro_pesca=None):
    filtro = {"tipo_documento": tipo}
    if comanda is not None:
        filtro["comanda"] = comanda
    else:
        filtro["registro_pesca"] = registro_pesca
    documento, _ = ImpressaoDocumento.objects.get_or_create(
        **filtro,
        defaults={"gerado_por": usuario, "status": ImpressaoDocumento.Status.GERADO},
    )
    return documento


def solicitar_documento(documento):
    documento.quantidade_solicitacoes += 1
    documento.status = (
        ImpressaoDocumento.Status.SOLICITADO
        if documento.quantidade_solicitacoes == 1
        else ImpressaoDocumento.Status.REIMPRESSO
    )
    documento.ultima_solicitacao_em = timezone.now()
    documento.save(
        update_fields=["quantidade_solicitacoes", "status", "ultima_solicitacao_em"]
    )
    return documento


class RegistroView(generics.CreateAPIView):
    """Cadastro público de novos clientes."""

    queryset = Usuario.objects.all()
    serializer_class = RegistroSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"


class GoogleLoginView(APIView):
    """Login via Google Identity Services usando authorization code flow."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    @staticmethod
    def _origem_permitida(origin):
        try:
            parsed = urlsplit(origin)
        except (TypeError, ValueError):
            return False
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return False
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            return False
        normalizada = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
        permitidas = {item.rstrip("/") for item in settings.GOOGLE_ALLOWED_ORIGINS}
        return normalizada in permitidas

    def post(self, request):
        if request.headers.get("X-Requested-With") != "XmlHttpRequest":
            return Response(
                {"detalhe": "Cabeçalho X-Requested-With é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            return Response(
                {"detalhe": "Login Google não configurado no servidor."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        code = request.data.get("code")
        origin = request.data.get("origin")
        if not code or not origin:
            return Response(
                {"detalhe": "Código de autorização e origem são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not self._origem_permitida(origin):
            return Response(
                {"detalhe": "Origem não autorizada para o login Google."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token_response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": origin,
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
        except requests.RequestException:
            return Response(
                {"detalhe": "O serviço de login Google está temporariamente indisponível."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if token_response.status_code >= 400:
            return Response(
                {"detalhe": "Não foi possível validar o login Google."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            access_token = token_response.json().get("access_token")
        except requests.exceptions.JSONDecodeError:
            access_token = None
        if not access_token:
            return Response(
                {"detalhe": "A resposta do Google não continha um token válido."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            userinfo_response = requests.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
        except requests.RequestException:
            return Response(
                {"detalhe": "O serviço de perfil Google está temporariamente indisponível."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if userinfo_response.status_code >= 400:
            return Response(
                {"detalhe": "Não foi possível carregar o perfil Google."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        perfil = userinfo_response.json()
        email = (perfil.get("email") or "").strip().lower()
        if not email or not perfil.get("email_verified"):
            return Response(
                {"detalhe": "Use uma conta Google com e-mail verificado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usuario = self._obter_ou_criar_usuario(perfil, email)
        refresh = RefreshToken.for_user(usuario)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UsuarioSerializer(usuario).data,
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def _obter_ou_criar_usuario(self, perfil, email):
        defaults = {
            "first_name": perfil.get("given_name", "")[:150],
            "last_name": perfil.get("family_name", "")[:150],
        }
        usuario = Usuario.objects.filter(email=email).first()
        if usuario:
            for campo, valor in defaults.items():
                if valor and getattr(usuario, campo) != valor:
                    setattr(usuario, campo, valor)
            usuario.save(update_fields=["first_name", "last_name"])
            return usuario

        base_username = slugify(email.split("@", 1)[0]) or "cliente"
        username = base_username[:140]
        contador = 1
        while Usuario.objects.filter(username=username).exists():
            contador += 1
            sufixo = f"-{contador}"
            username = f"{base_username[:150 - len(sufixo)]}{sufixo}"

        return Usuario.objects.create_user(
            username=username,
            email=email,
            password=None,
            **defaults,
        )


class MeView(generics.RetrieveUpdateAPIView):
    """Perfil do usuário autenticado, incluindo preferências de acessibilidade."""

    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ConteudoPublicoView(APIView):
    """Conteúdo institucional e operacional que pode ser consultado sem login."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        configuracao = ConfiguracaoEstabelecimento.objects.first()
        horarios = HorarioFuncionamento.objects.all()
        agora = timezone.localtime()
        horario_hoje = horarios.filter(dia_semana=agora.weekday()).first()
        aberto_agora = None
        if horario_hoje:
            if horario_hoje.fechado:
                aberto_agora = False
            elif horario_hoje.abre_as and horario_hoje.fecha_as:
                hora = agora.time()
                if horario_hoje.fecha_as > horario_hoje.abre_as:
                    aberto_agora = horario_hoje.abre_as <= hora < horario_hoje.fecha_as
                else:
                    aberto_agora = hora >= horario_hoje.abre_as or hora < horario_hoje.fecha_as

        return Response(
            {
                "estabelecimento": (
                    ConfiguracaoEstabelecimentoSerializer(configuracao).data
                    if configuracao
                    else {"nome": "Pesque & Pague"}
                ),
                "horarios": HorarioFuncionamentoSerializer(horarios, many=True).data,
                "aberto_agora": aberto_agora,
                "horario_hoje": (
                    HorarioFuncionamentoSerializer(horario_hoje).data if horario_hoje else None
                ),
                "lagos": LagoPescaSerializer(
                    LagoPesca.objects.filter(disponivel=True), many=True, context={"request": request}
                ).data,
                "especies": EspeciePeixeSerializer(
                    EspeciePeixe.objects.filter(disponivel=True), many=True, context={"request": request}
                ).data,
                "regras": RegraPescaSerializer(RegraPesca.objects.filter(ativa=True), many=True).data,
                "servicos": ServicoPescaSerializer(
                    ServicoPesca.objects.filter(disponivel=True), many=True
                ).data,
                "galeria": ImagemGaleriaSerializer(
                    ImagemGaleria.objects.filter(ativa=True), many=True, context={"request": request}
                ).data,
                "pedidos_habilitados": settings.ORDERS_ENABLED,
            }
        )


class LeituraPublicaEscritaStaffViewSet(viewsets.ModelViewSet):
    filtro_publico = {}

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [EhStaffOperacional()]

    def get_queryset(self):
        queryset = super().get_queryset()
        usuario = self.request.user
        if usuario.is_authenticated and (usuario.is_superuser or usuario.is_staff_operacional):
            return queryset
        return queryset.filter(**self.filtro_publico)


class LagoPescaViewSet(LeituraPublicaEscritaStaffViewSet):
    queryset = LagoPesca.objects.all()
    serializer_class = LagoPescaSerializer
    filtro_publico = {"disponivel": True}


class EspeciePeixeViewSet(LeituraPublicaEscritaStaffViewSet):
    queryset = EspeciePeixe.objects.all()
    serializer_class = EspeciePeixeSerializer
    filtro_publico = {"disponivel": True}


class RegraPescaViewSet(LeituraPublicaEscritaStaffViewSet):
    queryset = RegraPesca.objects.all()
    serializer_class = RegraPescaSerializer
    filtro_publico = {"ativa": True}


class ServicoPescaViewSet(LeituraPublicaEscritaStaffViewSet):
    queryset = ServicoPesca.objects.all()
    serializer_class = ServicoPescaSerializer
    filtro_publico = {"disponivel": True}


class CategoriaCardapioViewSet(viewsets.ModelViewSet):
    queryset = CategoriaCardapio.objects.all()
    serializer_class = CategoriaCardapioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [EhStaffOperacional()]

class ItemCardapioViewSet(viewsets.ModelViewSet):
    queryset = ItemCardapio.objects.select_related("categoria").all()
    serializer_class = ItemCardapioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [EhStaffOperacional()]

    def get_queryset(self):
        qs = super().get_queryset()
        usuario = self.request.user
        if not usuario.is_authenticated or not (usuario.is_superuser or usuario.is_staff_operacional):
            qs = qs.filter(disponivel=True)
        categoria_id = self.request.query_params.get("categoria")
        if categoria_id:
            qs = qs.filter(categoria_id=categoria_id)
        if self.request.query_params.get("disponivel") == "true":
            qs = qs.filter(disponivel=True)
        return qs


class MesaViewSet(viewsets.ModelViewSet):
    queryset = Mesa.objects.all()
    serializer_class = MesaSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [EhStaffOperacional()]


class ComandaViewSet(viewsets.ModelViewSet):
    """
    Representa a comanda/carrinho do cliente.
    Clientes só enxergam as próprias comandas; a equipe operacional vê todas.
    """

    serializer_class = ComandaSerializer
    permission_classes = [permissions.IsAuthenticated, ComandaEhDoClienteOuStaff]

    def get_queryset(self):
        user = self.request.user
        qs = Comanda.objects.select_related("mesa", "cliente").prefetch_related("itens__item_cardapio")
        if user.is_superuser or user.is_staff_operacional:
            status_param = self.request.query_params.get("status")
            if status_param:
                qs = qs.filter(status=status_param)
            return qs
        return qs.filter(cliente=user)

    def perform_create(self, serializer):
        exigir_pedidos_ativos()
        if Comanda.objects.filter(cliente=self.request.user, status=Comanda.Status.ABERTA).exists():
            raise ValidationError("Você já possui uma comanda aberta.")
        mesa = serializer.validated_data["mesa"]
        if Comanda.objects.filter(
            mesa=mesa,
            status__in=[
                Comanda.Status.ABERTA,
                Comanda.Status.ENVIADA,
                Comanda.Status.EM_PREPARO,
                Comanda.Status.PRONTA,
                Comanda.Status.ENTREGUE,
            ],
        ).exists():
            raise ValidationError("Esta mesa já possui uma comanda em atendimento.")
        serializer.save(cliente=self.request.user)

    @action(detail=True, methods=["post"])
    def adicionar_item(self, request, pk=None):
        """Adiciona um item ao carrinho (cria ou soma quantidade se já existir)."""
        exigir_pedidos_ativos()
        comanda = self.get_object()
        if comanda.status != Comanda.Status.ABERTA:
            return Response(
                {"detalhe": "Só é possível alterar uma comanda aberta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item_cardapio_id = request.data.get("item_cardapio")
        try:
            quantidade = Decimal(str(request.data.get("quantidade", 1)))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {"quantidade": "Informe uma quantidade válida."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if quantidade <= 0 or quantidade > 100:
            return Response(
                {"quantidade": "A quantidade deve estar entre 0,01 e 100."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        observacoes = request.data.get("observacoes", "")
        if len(observacoes) > 200:
            return Response(
                {"observacoes": "Use no máximo 200 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            item_cardapio = ItemCardapio.objects.get(pk=item_cardapio_id, disponivel=True)
        except ItemCardapio.DoesNotExist:
            return Response(
                {"detalhe": "Item do cardápio não encontrado ou indisponível."},
                status=status.HTTP_404_NOT_FOUND,
            )

        item_comanda, criado = ItemComanda.objects.get_or_create(
            comanda=comanda,
            item_cardapio=item_cardapio,
            observacoes=observacoes,
            defaults={"quantidade": quantidade, "preco_unitario": item_cardapio.preco},
        )
        if not criado:
            nova_quantidade = item_comanda.quantidade + quantidade
            if nova_quantidade > 100:
                return Response(
                    {"quantidade": "A quantidade total por item não pode ultrapassar 100."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            item_comanda.quantidade = nova_quantidade
            item_comanda.save(update_fields=["quantidade"])

        comanda._prefetched_objects_cache = {}
        return Response(ComandaSerializer(comanda).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="remover_item/(?P<item_id>[^/.]+)")
    def remover_item(self, request, pk=None, item_id=None):
        exigir_pedidos_ativos()
        comanda = self.get_object()
        if comanda.status != Comanda.Status.ABERTA:
            return Response(
                {"detalhe": "Só é possível alterar uma comanda aberta."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ItemComanda.objects.filter(pk=item_id, comanda=comanda).delete()
        comanda._prefetched_objects_cache = {}
        return Response(ComandaSerializer(comanda).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def alterar_status(self, request, pk=None):
        """Muda o status da comanda (ex.: enviar para cozinha, marcar como paga)."""
        exigir_pedidos_ativos()
        comanda = self.get_object()
        novo_status = request.data.get("status")
        valores_validos = dict(Comanda.Status.choices)
        if novo_status not in valores_validos:
            return Response(
                {"detalhe": "Status inválido."}, status=status.HTTP_400_BAD_REQUEST
            )

        # Cliente comum só pode enviar a própria comanda para a cozinha ou cancelar
        user = request.user
        if not (user.is_superuser or user.is_staff_operacional):
            if novo_status not in (Comanda.Status.ENVIADA, Comanda.Status.CANCELADA):
                return Response(
                    {"detalhe": "Você não tem permissão para esse status."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        comanda.status = novo_status
        comanda.save()
        return Response(ComandaSerializer(comanda).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def gerar_pagamento(self, request, pk=None):
        """Gera uma cobrança Pix (QR Code) no Mercado Pago para o total da comanda."""
        exigir_pagamentos_online_ativos()
        comanda = self.get_object()

        if comanda.pago:
            return Response(
                {"detalhe": "Esta comanda já está paga."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not comanda.itens.exists():
            return Response(
                {"detalhe": "Adicione itens à comanda antes de gerar o pagamento."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reaproveita um pagamento pendente/recente já existente, se houver,
        # em vez de gerar um novo QR Code a cada clique.
        pagamento_existente = comanda.pagamentos.filter(
            status__in=[Pagamento.Status.PENDENTE, Pagamento.Status.EM_PROCESSO]
        ).order_by("-criado_em").first()
        if pagamento_existente:
            try:
                atualizar_status_pagamento(pagamento_existente)
            except MercadoPagoNaoConfiguradoError as erro:
                return Response({"detalhe": str(erro)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            if pagamento_existente.status != Pagamento.Status.APROVADO:
                return Response(PagamentoSerializer(pagamento_existente).data)

        try:
            pagamento = criar_pagamento_pix(comanda, request.user)
        except MercadoPagoNaoConfiguradoError as erro:
            return Response({"detalhe": str(erro)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except RuntimeError as erro:
            return Response({"detalhe": str(erro)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(PagamentoSerializer(pagamento).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def status_pagamento(self, request, pk=None):
        """Consulta (com atualização) o status do pagamento mais recente da comanda."""
        exigir_pagamentos_online_ativos()
        comanda = self.get_object()
        pagamento = comanda.pagamentos.order_by("-criado_em").first()
        if not pagamento:
            return Response(
                {"detalhe": "Nenhum pagamento gerado para esta comanda."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if pagamento.status not in (Pagamento.Status.APROVADO, Pagamento.Status.REJEITADO, Pagamento.Status.CANCELADO):
            try:
                atualizar_status_pagamento(pagamento)
            except MercadoPagoNaoConfiguradoError as erro:
                return Response({"detalhe": str(erro)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(PagamentoSerializer(pagamento).data)

    def _tipos_impressao_permitidos(self):
        user = self.request.user
        if user.is_superuser or user.is_staff_operacional:
            return TIPOS_COMANDA_STAFF
        return TIPOS_COMANDA_CLIENTE

    @action(detail=True, methods=["post"])
    def gerar_impressao(self, request, pk=None):
        comanda = self.get_object()
        tipo = obter_tipo_documento(request, self._tipos_impressao_permitidos())
        documento = obter_ou_gerar_documento(
            usuario=request.user,
            tipo=tipo,
            comanda=comanda,
        )
        return Response(ImpressaoDocumentoSerializer(documento).data)

    @action(detail=True, methods=["post"])
    def solicitar_impressao(self, request, pk=None):
        comanda = self.get_object()
        tipo = obter_tipo_documento(request, self._tipos_impressao_permitidos())
        documento = obter_ou_gerar_documento(
            usuario=request.user,
            tipo=tipo,
            comanda=comanda,
        )
        solicitar_documento(documento)
        return Response(ImpressaoDocumentoSerializer(documento).data)


class ItemComandaViewSet(viewsets.ModelViewSet):
    serializer_class = ItemComandaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ItemComanda.objects.select_related("comanda", "item_cardapio")
        if user.is_superuser or user.is_staff_operacional:
            return qs
        return qs.filter(comanda__cliente=user)

    def perform_create(self, serializer):
        exigir_pedidos_ativos()
        comanda = serializer.validated_data["comanda"]
        user = self.request.user
        if not (user.is_superuser or user.is_staff_operacional or comanda.cliente_id == user.id):
            raise PermissionDenied("Você não pode adicionar itens a esta comanda.")
        if comanda.status != Comanda.Status.ABERTA:
            raise ValidationError("Só é possível alterar uma comanda aberta.")
        serializer.save()

    def perform_update(self, serializer):
        exigir_pedidos_ativos()
        if serializer.instance.comanda.status != Comanda.Status.ABERTA:
            raise ValidationError("Só é possível alterar uma comanda aberta.")
        serializer.save()

    def perform_destroy(self, instance):
        exigir_pedidos_ativos()
        if instance.comanda.status != Comanda.Status.ABERTA:
            raise ValidationError("Só é possível alterar uma comanda aberta.")
        instance.delete()


class RegistroPescaViewSet(viewsets.ModelViewSet):
    """Entrada, pesagens e saída de pescadores, acessível apenas à equipe."""

    serializer_class = RegistroPescaSerializer
    permission_classes = [EhStaffOperacional]

    def get_queryset(self):
        qs = RegistroPesca.objects.select_related(
            "lago", "responsavel_entrada"
        ).prefetch_related("capturas__especie", "capturas__registrado_por")
        status_param = self.request.query_params.get("status")
        busca = self.request.query_params.get("busca")
        if status_param:
            qs = qs.filter(status=status_param)
        if busca:
            qs = qs.filter(pescador_nome__icontains=busca.strip())
        return qs

    def perform_create(self, serializer):
        lago = serializer.validated_data["lago"]
        if not lago.disponivel:
            raise ValidationError({"lago": "Este lago está indisponível para novos registros."})
        modalidade = serializer.validated_data["modalidade"]
        if (
            lago.modalidade == LagoPesca.Modalidade.ESPORTIVA
            and modalidade == RegistroPesca.Modalidade.PESQUE_PAGUE
        ):
            raise ValidationError({"modalidade": "Este lago opera somente com pesca esportiva."})
        if (
            lago.modalidade == LagoPesca.Modalidade.PESQUE_PAGUE
            and modalidade == RegistroPesca.Modalidade.ESPORTIVA
        ):
            raise ValidationError({"modalidade": "Este lago opera somente como pesque-pague."})
        valor_entrada = serializer.validated_data.get("valor_entrada", lago.valor_diaria)
        serializer.save(responsavel_entrada=self.request.user, valor_entrada=valor_entrada)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def adicionar_captura(self, request, pk=None):
        registro = self.get_object()
        if registro.status != RegistroPesca.Status.ABERTO:
            return Response(
                {"detalhe": "Só é possível registrar pesagens em um atendimento aberto."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CapturaPescaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        especie = serializer.validated_data["especie"]
        if not especie.disponivel:
            raise ValidationError({"especie": "Esta espécie está indisponível."})
        serializer.save(
            registro=registro,
            preco_quilo=especie.preco_quilo,
            registrado_por=request.user,
        )
        registro.refresh_from_db()
        return Response(RegistroPescaSerializer(registro).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def encerrar(self, request, pk=None):
        registro = self.get_object()
        if registro.status != RegistroPesca.Status.ABERTO:
            return Response(
                {"detalhe": "Este atendimento já foi encerrado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        registro.status = RegistroPesca.Status.ENCERRADO
        registro.saida_em = timezone.now()
        registro.save(update_fields=["status", "saida_em"])
        return Response(RegistroPescaSerializer(registro).data)

    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        registro = self.get_object()
        if registro.status != RegistroPesca.Status.ABERTO:
            return Response(
                {"detalhe": "Somente atendimentos abertos podem ser cancelados."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        registro.status = RegistroPesca.Status.CANCELADO
        registro.saida_em = timezone.now()
        registro.save(update_fields=["status", "saida_em"])
        return Response(RegistroPescaSerializer(registro).data)

    @action(detail=True, methods=["post"])
    def gerar_impressao(self, request, pk=None):
        registro = self.get_object()
        tipo = obter_tipo_documento(request, TIPOS_PESCA)
        documento = obter_ou_gerar_documento(
            usuario=request.user,
            tipo=tipo,
            registro_pesca=registro,
        )
        return Response(ImpressaoDocumentoSerializer(documento).data)

    @action(detail=True, methods=["post"])
    def solicitar_impressao(self, request, pk=None):
        registro = self.get_object()
        tipo = obter_tipo_documento(request, TIPOS_PESCA)
        documento = obter_ou_gerar_documento(
            usuario=request.user,
            tipo=tipo,
            registro_pesca=registro,
        )
        solicitar_documento(documento)
        return Response(ImpressaoDocumentoSerializer(documento).data)


def assinatura_webhook_valida(request, payment_id):
    """Valida x-signature quando o segredo de webhook estiver configurado."""

    segredo = settings.MERCADO_PAGO_WEBHOOK_SECRET
    if not segredo:
        return True
    assinatura = request.headers.get("x-signature", "")
    request_id = request.headers.get("x-request-id", "")
    partes = {}
    for trecho in assinatura.split(","):
        chave, separador, valor = trecho.strip().partition("=")
        if separador:
            partes[chave] = valor
    timestamp = partes.get("ts")
    assinatura_recebida = partes.get("v1")
    if not request_id or not timestamp or not assinatura_recebida:
        return False
    manifesto = f"id:{str(payment_id).lower()};request-id:{request_id};ts:{timestamp};"
    assinatura_esperada = hmac.new(
        segredo.encode("utf-8"), manifesto.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(assinatura_recebida, assinatura_esperada)


class WebhookMercadoPagoView(APIView):
    """
    Recebe as notificações de mudança de status enviadas pelo Mercado Pago.
    Não exige autenticação (o Mercado Pago não teria como enviar um JWT
    nosso), então o único dado confiável é o ID do pagamento — a partir dele
    sempre consultamos a API do Mercado Pago de novo, nunca confiamos no
    corpo da notificação em si.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        payment_id = (request.data.get("data") or {}).get("id") or request.query_params.get("id")
        tipo = request.data.get("type") or request.query_params.get("topic")

        if tipo == "payment" and payment_id:
            if not assinatura_webhook_valida(request, payment_id):
                return Response(
                    {"detalhe": "Assinatura do webhook inválida."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            try:
                pagamento = Pagamento.objects.get(mercado_pago_id=str(payment_id))
                atualizar_status_pagamento(pagamento)
            except (Pagamento.DoesNotExist, MercadoPagoNaoConfiguradoError):
                pass

        # O Mercado Pago só precisa de um 200 para não reenviar a notificação.
        return Response(status=status.HTTP_200_OK)
