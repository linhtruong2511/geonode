from django.contrib import admin

# Register your models here.
"""
mining_detection/admin.py
"""
from django.contrib import admin
from django.utils.html import format_html

from .models import InferenceStatistics, MiningDetectionJob


class InferenceStatisticsInline(admin.StackedInline):
    model = InferenceStatistics
    extra = 0
    readonly_fields = [
        "total_area_ha", "count", "max_area_ha", "min_area_ha",
        "avg_ndvi", "avg_ndwi", "avg_bsi", "severity_label_display", "created_at",
    ]
    fields = [
        ("total_area_ha", "count"),
        ("max_area_ha", "min_area_ha"),
        ("avg_ndvi", "avg_ndwi", "avg_bsi"),
        "severity_label_display",
        "created_at",
    ]

    def severity_label_display(self, obj):
        label = obj.severity_label
        color = {"Nghiêm trọng": "red", "Trung bình": "orange", "Nhẹ": "green"}.get(label, "gray")
        return format_html('<span style="color:{}">{}</span>', color, label)
    severity_label_display.short_description = "Mức độ"


@admin.register(MiningDetectionJob)
class MiningDetectionJobAdmin(admin.ModelAdmin):
    list_display = [
        "title", "status_colored", "geonode_layer_link",
        "created_by", "created_at", "completed_at", "poll_count",
    ]
    list_filter = ["status", "model_version", "created_at"]
    search_fields = ["title", "job_id", "created_by__username"]
    readonly_fields = [
        "job_id", "status", "created_at", "updated_at", "completed_at",
        "poll_count", "error_message", "shapefile_url", "geonode_layer_link",
    ]
    inlines = [InferenceStatisticsInline]
    fieldsets = (
        ("Thông tin cơ bản", {
            "fields": ("title", "job_id", "status", "created_by"),
        }),
        ("Tham số phân tích", {
            "fields": (
                "aoi_geom", "date_from", "date_to",
                "model_version", "cloud_cover_pct", "extra_params",
            ),
        }),
        ("Kết quả", {
            "fields": (
                "result_dataset", "shapefile_url", "geonode_layer_link",
            ),
        }),
        ("Tracking", {
            "fields": (
                "error_message", "poll_count",
                "created_at", "updated_at", "completed_at",
            ),
            "classes": ("collapse",),
        }),
    )

    def status_colored(self, obj):
        color = {
            "COMPLETED": "green",
            "RUNNING":   "orange",
            "FAILED":    "red",
            "PENDING":   "gray",
        }.get(obj.status, "gray")
        return format_html(
            '<span style="color:{};font-weight:bold">{}</span>', color, obj.status
        )
    status_colored.short_description = "Trạng thái"

    def geonode_layer_link(self, obj):
        if obj.result_dataset:
            url = f"/layers/{obj.result_dataset.alternate}/"
            return format_html('<a href="{}" target="_blank">{}</a>', url, obj.geonode_layer_name)
        return "—"
    geonode_layer_link.short_description = "GeoNode Layer"


# ------------------------------------------------------------------ #
# mining_detection/signals.py
# ------------------------------------------------------------------ #
"""
Signals: tự động liên kết Dataset với Job khi Dataset mới được tạo,
và gửi thông báo khi job hoàn thành.
"""

# (Tách ra file signals.py trong thực tế, gộp đây để tiện đọc)

from django.db.models.signals import post_save
from django.dispatch import receiver


# Uncomment khi deploy với GeoNode thực tế:
# from geonode.layers.models import Dataset
#
# @receiver(post_save, sender=Dataset)
# def auto_link_dataset_to_job(sender, instance, created, **kwargs):
#     """
#     Khi một Dataset mới được tạo/cập nhật, kiểm tra xem có Job nào
#     đang chờ với shapefile_url khớp alternate của Dataset không.
#     """
#     if not created:
#         return
#
#     jobs = MiningDetectionJob.objects.filter(
#         result_dataset__isnull=True,
#         shapefile_url__icontains=instance.alternate,
#         status=JobStatus.COMPLETED,
#     )
#     for job in jobs:
#         job.result_dataset = instance
#         job.save(update_fields=["result_dataset", "updated_at"])


@receiver(post_save, sender=MiningDetectionJob)
def notify_on_completion(sender, instance, **kwargs):
    """Log khi job hoàn thành (có thể extend thành email/webhook)."""
    if instance.status == "COMPLETED":
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            f"[MiningJob] Job '{instance.title}' hoàn thành. "
            f"Layer: {instance.geonode_layer_name}"
        )


# ------------------------------------------------------------------ #
# mining_detection/urls.py
# ------------------------------------------------------------------ #

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MiningDetectionJobViewSet

router = DefaultRouter()
router.register(r"mining-jobs", MiningDetectionJobViewSet, basename="mining-jobs")

urlpatterns = [
    path("api/v2/", include(router.urls)),
]


# ------------------------------------------------------------------ #
# mining_detection/apps.py
# ------------------------------------------------------------------ #

from django.apps import AppConfig


class MiningDetectionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mining_detection"
    verbose_name = "Mining Detection"

    def ready(self):
        # Import signals để kích hoạt receivers
        import mining_detection.signals  # noqa: F401