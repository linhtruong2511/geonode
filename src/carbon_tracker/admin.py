from django.contrib import admin

from .models import OCO2Data


@admin.register(OCO2Data)
class OCO2DataAdmin(admin.ModelAdmin):
    list_display = ("sounding_id", "acquisition_time", "xco2", "file_path")
    list_filter = ("acquisition_time",)
    search_fields = ("sounding_id", "file_path")
    ordering = ("-acquisition_time",)
    readonly_fields = ("sounding_id", "acquisition_time", "xco2", "location", "file_path")
