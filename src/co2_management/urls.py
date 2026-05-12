from django.urls import path, include, re_path
from .template_views import ReactAppView

app_name = 'co2_management'

urlpatterns = [
    # Bảng điều khiển (Dashboard) và các React Routes (Catch-all cho SPA)
    # Các API REST Framework
    path('api/v1/', include('co2_management.api_urls')),

    # Giao diện ứng dụng chính
    re_path(r'^.*$', ReactAppView.as_view(), name='react_app'),
]
