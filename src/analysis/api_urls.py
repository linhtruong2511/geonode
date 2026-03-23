from .views import CustomImporterViewSet, AnalysisUpdateResult
from django.urls import path

urlpatterns = [
    path('analysis/upload/', CustomImporterViewSet.as_view({'post': 'create'}), name='custom_upload_api'),
    path('analysis/result/<str:job_id>/', AnalysisUpdateResult.as_view(), name='update_result_api'),
]