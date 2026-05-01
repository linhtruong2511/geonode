from django.contrib import admin

from .models import VietNamOCO2Data


@admin.register(VietNamOCO2Data)
class VietNamOCO2DataAdmin(admin.ModelAdmin):
    list_display = (
        "sounding_id",
        "acquisition_time",
        "xco2",
        "xco2_uncertainty",
        "xco2_quality_flag",
        "operation_mode",
        "source_file",
    )
    list_filter = ("acquisition_time", "xco2_quality_flag", "operation_mode")
    search_fields = ("sounding_id", "source_file", "source_folder", "operation_mode")
    ordering = ("-acquisition_time",)
    readonly_fields = (
        "sounding_id",
        "acquisition_time",
        "xco2",
        "xco2_uncertainty",
        "xco2_quality_flag",
        "latitude",
        "longitude",
        "location",
        "orbit",
        "operation_mode",
        "source_file",
        "source_folder",
        "raw_metadata",
        "created_at",
    )
