from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register("categorias", views.CategoriaCardapioViewSet, basename="categoria")
router.register("cardapio", views.ItemCardapioViewSet, basename="item-cardapio")
router.register("mesas", views.MesaViewSet, basename="mesa")
router.register("comandas", views.ComandaViewSet, basename="comanda")
router.register("itens-comanda", views.ItemComandaViewSet, basename="item-comanda")

urlpatterns = [
    path("auth/registro/", views.RegistroView.as_view(), name="registro"),
    path("auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("auth/google/", views.GoogleLoginView.as_view(), name="google-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("pagamentos/webhook/", views.WebhookMercadoPagoView.as_view(), name="webhook-mercadopago"),
    path("", include(router.urls)),
]
