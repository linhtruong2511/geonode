from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import (
    DatasetViewSet, StationViewSet, ObservationViewSet,
    MeteorologicalEventViewSet, RasterGranuleIndexViewSet
)
from .template_views import ReactAppView

app_name = 'wind_management'

router = DefaultRouter()
router.register(r'datasets', DatasetViewSet, basename='dataset')
router.register(r'stations', StationViewSet, basename='station')
router.register(r'observations', ObservationViewSet, basename='observation')
router.register(r'events', MeteorologicalEventViewSet, basename='event')
router.register(r'raster-granules', RasterGranuleIndexViewSet, basename='raster-granule')

urlpatterns = [
    # API endpoints
    path('api/v1/', include(router.urls)),
    
    # Giao diện ứng dụng chính (SPA)
    re_path(r'^.*$', ReactAppView.as_view(), name='react_app'),
]
