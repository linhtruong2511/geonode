from django.urls import path
from .views import (
    AnalysisList, create, analyze, analysis_detail, index,
    check_status_api, AnalysisUpdateResult, CustomImporterViewSet,
)

app_name = 'analysis'

urlpatterns = [
    # Main pages
    path('', AnalysisList.as_view(), name='analysis-list'),
    path('home/', index, name='index'),
    path('create/', create, name='analysis-create'),
    path('<int:dataset_id>/analyze/', analyze, name='analyze'),
    path('<int:pk>/detail/', analysis_detail, name='analysis-detail'),

    # Internal polling API (called by JS in the browser)
    path('api/status/<str:job_id>/', check_status_api, name='check-status'),

    # Webhook: AI service calls this when job completes
    path('api/result/<str:job_id>/', AnalysisUpdateResult.as_view(), name='update-result'),

    # Custom upload proxy (for AI worker to push shapefiles back)
    path('api/upload/', CustomImporterViewSet.as_view({'post': 'create'}), name='custom-upload'),
]