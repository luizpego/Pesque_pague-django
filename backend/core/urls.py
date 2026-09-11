from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
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
