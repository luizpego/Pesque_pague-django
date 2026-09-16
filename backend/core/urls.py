from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from . import gestao
from .midia import MidiaView
from .atendimento_views import AtendimentoViewSet

router = DefaultRouter()
router.register("atendimento", AtendimentoViewSet, basename="atendimento")
router.register("configuracao", gestao.ConfiguracaoViewSet, basename="configuracao")
router.register("horarios", gestao.HorarioViewSet, basename="horarios")
router.register("galeria", gestao.GaleriaViewSet, basename="galeria")
router.register("usuarios-gestao", gestao.UsuarioGestaoViewSet, basename="usuarios-gestao")
router.register("estoque", gestao.EstoqueViewSet, basename="estoque")
router.register("caixa", gestao.CaixaViewSet, basename="caixa")
router.register("reservas", gestao.ReservaViewSet, basename="reservas")
router.register("metas", gestao.MetaViewSet, basename="metas")
router.register("dashboard", gestao.DashboardViewSet, basename="dashboard")
router.register("categorias", views.CategoriaCardapioViewSet, basename="categoria")
router.register("cardapio", views.ItemCardapioViewSet, basename="item-cardapio")
router.register("mesas", views.MesaViewSet, basename="mesa")
router.register("comandas", views.ComandaViewSet, basename="comanda")
router.register("itens-comanda", views.ItemComandaViewSet, basename="item-comanda")
router.register("lagos", views.LagoPescaViewSet, basename="lago-pesca")
router.register("especies", views.EspeciePeixeViewSet, basename="especie-peixe")
router.register("regras-pesca", views.RegraPescaViewSet, basename="regra-pesca")
router.register("servicos-pesca", views.ServicoPescaViewSet, basename="servico-pesca")
router.register("registros-pesca", views.RegistroPescaViewSet, basename="registro-pesca")

urlpatterns = [
    path("midia/<path:nome>", MidiaView.as_view(), name="midia"),
    path("auth/registro/", views.RegistroView.as_view(), name="registro"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/google/", views.GoogleLoginView.as_view(), name="google-login"),
    path("auth/refresh/", views.RenovarTokenView.as_view(), name="refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("conteudo-publico/", views.ConteudoPublicoView.as_view(), name="conteudo-publico"),
    path("pagamentos/webhook/", views.WebhookMercadoPagoView.as_view(), name="webhook-mercadopago"),
    path("", include(router.urls)),
]
