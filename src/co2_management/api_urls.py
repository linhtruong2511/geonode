from rest_framework.routers import DefaultRouter
from .views import (
    SatelliteViewSet, MeasurementSourceViewSet, MeasurementViewSet,
    MonitoringLocationViewSet, DataComparisonViewSet, AnalysisJobViewSet
)

# Sử dụng DefaultRouter để tự động tạo ra các URL patterns cho các ViewSet
router = DefaultRouter()

# Đăng ký các endpoints cho module CO2
router.register('satellites', SatelliteViewSet) # /api/v1/satellites/
router.register('sources', MeasurementSourceViewSet) # /api/v1/sources/
router.register('measurements', MeasurementViewSet) # /api/v1/measurements/
router.register('locations', MonitoringLocationViewSet) # /api/v1/locations/
router.register('comparisons', DataComparisonViewSet) # /api/v1/comparisons/
router.register('jobs', AnalysisJobViewSet) # /api/v1/jobs/

urlpatterns = router.urls
