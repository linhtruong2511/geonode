from django.urls import path, include
from .template_views import (
    DashboardView, SatelliteListView, SatelliteDetailView,
    SourceListView, SourceDetailView, MeasurementListView, MeasurementDetailView,
    LocationListView, LocationCreateView, LocationDetailView, LocationUpdateView, LocationDeleteView,
    ComparisonListView, ComparisonReportView,
    JobListView, JobCreateView, JobDetailView,
    AuditLogListView
)

app_name = 'co2_management'

urlpatterns = [
    # Dashboard
    path('', DashboardView.as_view(), name='dashboard'),

    # Satellites
    path('satellites/', SatelliteListView.as_view(), name='satellite_list'),
    path('satellites/<int:pk>/', SatelliteDetailView.as_view(), name='satellite_detail'),

    # Sources
    path('sources/', SourceListView.as_view(), name='source_list'),
    path('sources/<int:pk>/', SourceDetailView.as_view(), name='source_detail'),

    # Measurements
    path('measurements/', MeasurementListView.as_view(), name='measurement_list'),
    path('measurements/<int:pk>/', MeasurementDetailView.as_view(), name='measurement_detail'),

    # Monitoring Locations
    path('locations/', LocationListView.as_view(), name='location_list'),
    path('locations/new/', LocationCreateView.as_view(), name='location_create'),
    path('locations/<int:pk>/', LocationDetailView.as_view(), name='location_detail'),
    path('locations/<int:pk>/edit/', LocationUpdateView.as_view(), name='location_update'),
    path('locations/<int:pk>/delete/', LocationDeleteView.as_view(), name='location_delete'),

    # Comparisons
    path('comparisons/', ComparisonListView.as_view(), name='comparison_list'),
    path('comparisons/report/', ComparisonReportView.as_view(), name='comparison_report'),

    # Analysis Jobs
    path('jobs/', JobListView.as_view(), name='job_list'),
    path('jobs/new/', JobCreateView.as_view(), name='job_create'),
    path('jobs/<int:pk>/', JobDetailView.as_view(), name='job_detail'),

    # Audit Log (admin only)
    path('audit-log/', AuditLogListView.as_view(), name='audit_log'),

    # API
    path('api/v1/', include('co2_management.api_urls')),
]
