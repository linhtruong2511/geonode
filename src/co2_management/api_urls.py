from rest_framework.routers import DefaultRouter
from .views import (
    SatelliteViewSet, MeasurementSourceViewSet, MeasurementViewSet,
    MonitoringLocationViewSet, DataComparisonViewSet, AnalysisJobViewSet
)

router = DefaultRouter()
router.register('satellites', SatelliteViewSet)
router.register('sources', MeasurementSourceViewSet)
router.register('measurements', MeasurementViewSet)
router.register('locations', MonitoringLocationViewSet)
router.register('comparisons', DataComparisonViewSet)
router.register('jobs', AnalysisJobViewSet)

urlpatterns = router.urls
