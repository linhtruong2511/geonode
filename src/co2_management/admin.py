from django.contrib import admin
from django.contrib.gis import admin as gis_admin
from .models import (
    Satellite, SatelliteInstrument, MeasurementSource, MeasurementMetadata,
    Measurement, VerticalProfile, QualityAssessment, MonitoringLocation,
    TemporalSeries, DataComparison, AnalysisJob, AuditLog
)

class SatelliteInstrumentInline(admin.TabularInline):
    model = SatelliteInstrument
    extra = 1

@admin.register(Satellite)
class SatelliteAdmin(admin.ModelAdmin):
    list_display = ('satellite_name', 'operator', 'launch_date', 'is_active')
    list_filter = ('operator', 'is_active')
    inlines = [SatelliteInstrumentInline]

@admin.register(MeasurementSource)
class MeasurementSourceAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'satellite', 'file_format', 'measurement_date', 'quality_checked')
    list_filter = ('satellite', 'file_format', 'quality_checked')
    search_fields = ('file_name',)

@admin.register(Measurement)
class MeasurementAdmin(gis_admin.GISModelAdmin):
    list_display = ('id', 'source', 'data_source', 'measurement_time', 'xco2_ppm', 'xco2_quality_flag')
    list_filter = ('data_source', 'xco2_quality_flag')
    readonly_fields = ('geom',)
    date_hierarchy = 'measurement_time'

@admin.register(MonitoringLocation)
class MonitoringLocationAdmin(gis_admin.GISModelAdmin):
    list_display = ('location_name', 'location_type', 'latitude', 'longitude', 'radius_km')
    list_filter = ('location_type',)
    search_fields = ('location_name',)

@admin.register(AnalysisJob)
class AnalysisJobAdmin(admin.ModelAdmin):
    list_display = ('job_name', 'user', 'job_type', 'status', 'progress_percent')
    list_filter = ('status', 'job_type')
    readonly_fields = ('progress_percent', 'result_path')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'table_name', 'user', 'created_at')
    list_filter = ('action', 'table_name')
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
