from django.contrib import admin
from .models import Analysis


@admin.register(Analysis)
class AnalysisAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'status', 'target_dataset', 'owner',
        'total_area_ha', 'count', 'analysis_date', 'updated_at',
    )
    list_filter = ('status', 'mask_type', 'analysis_date')
    search_fields = ('title', 'name', 'job_id', 'target_dataset__title')
    readonly_fields = (
        'job_id', 'analysis_date', 'updated_at',
        'input_params', 'result_metadata', 'shapefile_url',
        'total_area_ha', 'count', 'max_area_ha', 'min_area_ha',
        'avg_ndvi', 'avg_ndwi', 'avg_bsi',
    )
    fieldsets = (
        ('Identification', {
            'fields': ('title', 'name', 'job_id', 'owner', 'target_dataset', 'mask_type')
        }),
        ('Status', {
            'fields': ('status', 'error_message', 'analysis_date', 'updated_at')
        }),
        ('Input Parameters', {
            'fields': ('input_params',),
            'classes': ('collapse',),
        }),
        ('Results', {
            'fields': (
                'total_area_ha', 'count', 'max_area_ha', 'min_area_ha',
                'avg_ndvi', 'avg_ndwi', 'avg_bsi', 'shapefile_url',
            )
        }),
        ('Raw Result', {
            'fields': ('result_metadata',),
            'classes': ('collapse',),
        }),
    )
