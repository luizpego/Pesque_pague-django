from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
import requests
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.exceptions import PermissionDenied

from .models import CategoriaCardapio, Comanda, ItemCardapio, ItemComanda, Mesa, Pagamento
from .pagamentos import MercadoPagoNaoConfiguradoError, atualizar_status_pagamento, criar_pagamento_pix
from .permissions import ComandaEhDoClienteOuStaff, EhStaffOperacional
from .serializers import (
    CategoriaCardapioSerializer,
    ComandaSerializer,
    ItemCardapioSerializer,
    ItemComandaSerializer,
    MesaSerializer,
    PagamentoSerializer,
    RegistroSerializer,
    UsuarioSerializer,
)

Usuario = get_user_model()


def exigir_pedidos_ativos():
    if not settings.ORDERS_ENABLED:
        raise PermissionDenied("Pedidos e pagamentos ainda não estão liberados neste site.")


class RegistroView(generics.CreateAPIView):
    """Cadastro público de novos clientes."""

    queryset = Usuario.objects.all()
    serializer_class = RegistroSerializer
    permission_classes = [permissions.AllowAny]


class GoogleLoginView(APIView):
    """Login via Google Identity Services usando authorization code flow."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

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
        if token_response.status_code >= 400:
            return Response(
                {"detalhe": "Não foi possível validar o login Google."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        access_token = token_response.json().get("access_token")
        userinfo_response = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
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


class CategoriaCardapioViewSet(viewsets.ModelViewSet):
    queryset = CategoriaCardapio.objects.all()
    serializer_class = CategoriaCardapioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [EhStaffOperacional()]


class ItemCardapioViewSet(viewsets.ModelViewSet):
    queryset = ItemCardapio.objects.select_related("categoria").all()
    serializer_class = ItemCardapioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [EhStaffOperacional()]

    def get_queryset(self):
        qs = super().get_queryset()
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
        serializer.save(cliente=self.request.user)

    @action(detail=True, methods=["post"])
    def adicionar_item(self, request, pk=None):
        """Adiciona um item ao carrinho (cria ou soma quantidade se já existir)."""
        exigir_pedidos_ativos()
        comanda = self.get_object()
        item_cardapio_id = request.data.get("item_cardapio")
        quantidade = request.data.get("quantidade", 1)
        observacoes = request.data.get("observacoes", "")

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
            item_comanda.quantidade += float(quantidade)
            item_comanda.save()

        return Response(ComandaSerializer(comanda).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="remover_item/(?P<item_id>[^/.]+)")
    def remover_item(self, request, pk=None, item_id=None):
        exigir_pedidos_ativos()
        comanda = self.get_object()
        ItemComanda.objects.filter(pk=item_id, comanda=comanda).delete()
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
        exigir_pedidos_ativos()
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
        serializer.save()


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
            try:
                pagamento = Pagamento.objects.get(mercado_pago_id=str(payment_id))
                atualizar_status_pagamento(pagamento)
            except (Pagamento.DoesNotExist, MercadoPagoNaoConfiguradoError):
                pass

        # O Mercado Pago só precisa de um 200 para não reenviar a notificação.
        return Response(status=status.HTTP_200_OK)
