from django.urls import path, include

app_name = 'co2_management'

urlpatterns = [
    path('api/v1/', include('co2_management.api_urls')),
]
