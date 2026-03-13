"""
URL configuration for Kodezera Intelligence Suite.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.api.views.health import health_check, healthz, readyz

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('apps.api.urls')),      # short prefix used by frontend
    path('api/v1/', include('apps.api.urls')),   # keep for backward compat
    path('api/health/', health_check, name='health'),  # public — no auth, for Docker/K8s
    path('healthz', healthz, name='healthz'),
    path('readyz', readyz, name='readyz'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
