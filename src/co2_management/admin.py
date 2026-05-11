from django.contrib import admin
from django.contrib.gis import admin as gis_admin
from .models import (
    Satellite, SatelliteInstrument, MeasurementSource, MeasurementMetadata,
    Measurement, VerticalProfile, QualityAssessment, MonitoringLocation,
    TemporalSeries, DataComparison, AnalysisJob, AuditLog
)

class SatelliteInstrumentInline(admin.TabularInline):
    """Hiển thị các thiết bị đi kèm ngay trong trang quản trị vệ tinh"""
    model = SatelliteInstrument
    extra = 1

@admin.register(Satellite)
class SatelliteAdmin(admin.ModelAdmin):
    """Cấu hình trang quản trị cho Vệ tinh"""
    list_display = ('satellite_name', 'operator', 'launch_date', 'is_active')
    list_filter = ('operator', 'is_active')
    inlines = [SatelliteInstrumentInline]

@admin.register(MeasurementSource)
class MeasurementSourceAdmin(admin.ModelAdmin):
    """Cấu hình trang quản trị cho Nguồn dữ liệu (Tệp tin)"""
    list_display = ('file_name', 'satellite', 'file_format', 'measurement_date', 'quality_checked')
    list_filter = ('satellite', 'file_format', 'quality_checked')
    search_fields = ('file_name',)

@admin.register(Measurement)
class MeasurementAdmin(gis_admin.GISModelAdmin):
    """
    Cấu hình trang quản trị cho Điểm đo.
    Sử dụng GISModelAdmin để hỗ trợ hiển thị bản đồ trực quan.
    """
    list_display = ('id', 'source', 'data_source', 'measurement_time', 'xco2_ppm', 'xco2_quality_flag')
    list_filter = ('data_source', 'xco2_quality_flag')
    readonly_fields = ('geom',)
    date_hierarchy = 'measurement_time'

@admin.register(MonitoringLocation)
class MonitoringLocationAdmin(gis_admin.GISModelAdmin):
    """Cấu hình trang quản trị cho Vị trí giám sát (có bản đồ)"""
    list_display = ('location_name', 'location_type', 'latitude', 'longitude', 'radius_km')
    list_filter = ('location_type',)
    search_fields = ('location_name',)

@admin.register(AnalysisJob)
class AnalysisJobAdmin(admin.ModelAdmin):
    """Cấu hình trang quản trị cho các phiên phân tích dữ liệu"""
    list_display = ('job_name', 'user', 'job_type', 'status', 'progress_percent')
    list_filter = ('status', 'job_type')
    readonly_fields = ('progress_percent', 'result_path')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """
    Cấu hình trang quản trị cho Nhật ký hệ thống.
    Chỉ cho phép xem (Read-only) để đảm bảo tính toàn vẹn của lịch sử.
    """
    list_display = ('action', 'table_name', 'user', 'created_at')
    list_filter = ('action', 'table_name')
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
