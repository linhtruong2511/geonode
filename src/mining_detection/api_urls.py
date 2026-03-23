from django.urls import path
from .views import MiningDetectionJobViewSet
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'mining-jobs', MiningDetectionJobViewSet, basename='mining-jobs')

urlpatterns = [
    
] + router.urls