from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


def status_api(request):
    """Endpoint simples para confirmar rapidamente que o backend está no ar."""
    return JsonResponse({"status": "ok", "servico": "Pesque & Pague API"})


urlpatterns = [
    path("", status_api, name="status"),
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
