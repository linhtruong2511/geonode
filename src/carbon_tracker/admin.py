from django.contrib import admin

from .models import GosatProduct, RetrievalResult, Sounding, VietNamOCO2Data


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


@admin.register(GosatProduct)
class GosatProductAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "file_name",
        "file_id",
        "sensor_name",
        "processing_level",
        "product_version",
        "start_date",
        "end_date",
    )
    list_filter = ("sensor_name", "processing_level", "product_version")
    search_fields = ("file_name", "file_id", "file_path")
    ordering = ("-start_date", "-id")


@admin.register(Sounding)
class SoundingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "sounding_unique_id",
        "product",
        "observation_time",
        "latitude",
        "longitude",
        "detailed_operation_mode",
        "sunglint_flag",
    )
    list_filter = ("detailed_operation_mode", "sunglint_flag", "product__sensor_name")
    search_fields = (
        "sounding_unique_id",
        "observation_request_id",
        "product__file_name",
        "product__file_id",
    )
    ordering = ("-observation_time", "-id")
    autocomplete_fields = ("product",)


@admin.register(RetrievalResult)
class RetrievalResultAdmin(admin.ModelAdmin):
    list_display = (
        "sounding",
        "xco2",
        "xco2_uncert",
        "xco2_quality_flag",
        "xch4",
        "xco",
    )
    list_filter = ("xco2_quality_flag", "xch4_quality_flag", "xco_quality_flag")
    search_fields = ("sounding__sounding_unique_id", "sounding__product__file_name")
    autocomplete_fields = ("sounding",)
