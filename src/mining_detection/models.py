"""
mining_detection/models.py
 
Tuân theo mô hình ResourceBase của GeoNode:
- MiningDetectionJob KHÔNG kế thừa ResourceBase (không phải geospatial resource)
- Thay vào đó, dùng FK tới Dataset (ResourceBase subtype) — layer do AI service upload lên GeoNode
- InferenceStatistics là OneToOne với Job để tách biệt dữ liệu thống kê
"""

from django.db import models
import uuid
from django.contrib.gis.db import models as gis_models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
try:
    from geonode.layers.models import Dataset
except ImportError:
    # Fallback nếu chạy ngoài GeoNode context
    Dataset = None
    
class JobStatus(models.TextChoices):
    PENDING   = "PENDING",   _("Pending")
    RUNNING   = "RUNNING",   _("Running")
    COMPLETED = "COMPLETED", _("Completed")
    FAILED    = "FAILED",    _("Failed")
# Create your models here.

class MiningDetectionJob(models.Model):
    """
    Đại diện cho một phiên phân tích khai thác khoáng sản trái phép.
 
    Flow:
    1. User tạo job → POST /analyze gửi tới AI service
    2. Celery task poll GET /status/{job_id} định kỳ
    3. Khi COMPLETED → GET /result/{job_id} → lưu statistics + link Dataset
    4. Dataset (shapefile kết quả) đã được AI service upload vào GeoNode
       và được quản lý bởi ResourceBase của GeoNode như một layer bình thường.
    """
    
    job_id = models.UUIDField(
        unique=True,
        default=uuid.uuid4,
        help_text=_("UUID trả về từ AI service (POST /analyze → job_id)"),
    )
    title = models.CharField(
        max_length=255,
        help_text=_("Tên mô tả cho phiên phân tích, VD: 'Quảng Ninh — Q1/2024'"),
    )
    aoi_geom = gis_models.PolygonField(
        srid=4326,
        help_text=_("Vùng phân tích (Area of Interest) dưới dạng Polygon WGS84"),
        null=True, 
        blank=True
    )
    
    date_from = models.DateField(help_text=_("Ngày bắt đầu lấy ảnh Sentinel-2"), null=True, blank=True)
    date_to   = models.DateField(help_text=_("Ngày kết thúc lấy ảnh Sentinel-2"), null=True, blank=True)
    
    model_version = models.CharField(
        max_length=64,
        default="v2.1-sentinel",
        help_text=_("Phiên bản model AI được sử dụng"),
    )
    
    cloud_cover_pct = models.FloatField(
        default=20.0,
        help_text=_("Ngưỡng mây tối đa cho phép (%) khi lấy ảnh WCS"),
    )
    
    extra_params = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Tham số bổ sung gửi tới AI service (tile_size, threshold, ...)"),
    )
    
    status = models.CharField(
        max_length=16,
        choices=JobStatus.choices,
        default=JobStatus.PENDING,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    poll_count    = models.PositiveIntegerField(
        default=0,
        help_text=_("Số lần Celery đã poll /status từ AI service"),
    )
    
    # ------------------------------------------------------------------ #
    # Ownership — dùng cùng pattern với ResourceBase.owner
    # ------------------------------------------------------------------ #
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="mining_jobs",
        help_text=_("User tạo job (giống ResourceBase.owner)"),
    )
    
    # ------------------------------------------------------------------ #
    # Timestamps
    # ------------------------------------------------------------------ #
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # ------------------------------------------------------------------ #
    # Link tới GeoNode Dataset (ResourceBase subtype)
    # ------------------------------------------------------------------ #
    result_dataset = models.OneToOneField(
        "layers.Dataset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_detection_job",
        help_text=_(
            "GeoNode Dataset layer được upload từ AI service. "
            "Được quản lý hoàn toàn bởi ResourceBase — "
            "permissions, metadata, thumbnail do GeoNode xử lý."
        ),
    )
    # ------------------------------------------------------------------ #
    # Link tới dataset gốc (nếu cần, có thể dùng để audit hoặc re-run)
    # ------------------------------------------------------------------ #
    base_dataset = models.ForeignKey(
        "layers.Dataset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_jobs_as_base",
        help_text=_(
            "Dataset gốc (nếu có) mà job này dựa trên. "
            "Không bắt buộc, nhưng có thể dùng để audit hoặc re-run với cùng dữ liệu đầu vào. "
            "Ví dụ: dataset chứa ảnh Sentinel-2 đã được lọc theo AOI và cloud cover."
        ),
    )

    shapefile_url = models.URLField(
        blank=True,
        null=True,
        help_text=_("URL layer trên GeoNode (từ API result: shapefile_url)"),
    )
    
    result_execution_id = models.CharField(blank=True, null=True)
    message_progress = models.CharField(default='', null=True, blank=True)
    progress_percentage = models.IntegerField(default=0)
    
    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Mining detection job")
        verbose_name_plural = _("Mining detection jobs")
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["created_by", "status"]),
        ]
 
    def __str__(self):
        return f"{self.title} [{self.status}]"
 
    @property
    def duration_seconds(self):
        """Thời gian chạy nếu đã COMPLETED."""
        if self.completed_at and self.created_at:
            return int((self.completed_at - self.created_at).total_seconds())
        return None
 
    @property
    def geonode_layer_name(self):
        """Tên layer trong GeoNode (alternate), VD: 'geonode:ai_mining_qn_q1'."""
        if self.result_dataset:
            return self.result_dataset.alternate
        return None
    
class InferenceStatistics(models.Model):
    """
    Lưu trữ thống kê trả về từ GET /result/{job_id}.
    Tách riêng khỏi MiningDetectionJob để:
    - Rõ ràng về vòng đời dữ liệu (chỉ tồn tại khi COMPLETED)
    - Dễ query/aggregate theo nhiều job
    - Có thể extend thêm trường mà không làm nặng bảng Job
    """
 
    job = models.OneToOneField(
        MiningDetectionJob,
        on_delete=models.CASCADE,
        related_name="statistics",
        primary_key=True,
    )
 
    # Thống kê diện tích
    total_area_ha = models.FloatField(help_text=_("Tổng diện tích khai thác (hectare)"))
    count         = models.PositiveIntegerField(help_text=_("Số lượng vùng phát hiện"))
    max_area_ha   = models.FloatField(help_text=_("Diện tích vùng lớn nhất"))
    min_area_ha   = models.FloatField(help_text=_("Diện tích vùng nhỏ nhất"))
 
    # Chỉ số viễn thám (spectral indices)
    avg_ndvi = models.FloatField(
        help_text=_("NDVI trung bình — âm = đất trống/khai thác"),
    )
    avg_ndwi = models.FloatField(
        help_text=_("NDWI trung bình — dương = có nước bề mặt"),
    )
    avg_bsi = models.FloatField(
        help_text=_("BSI trung bình — dương cao = đất trống/đá lộ thiên"),
    )
 
    # Lưu toàn bộ response gốc từ AI service để audit
    raw_response = models.JSONField(
        default=dict,
        help_text=_("Full JSON response từ GET /result/{job_id}"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        verbose_name = _("Inference statistics")
        verbose_name_plural = _("Inference statistics")
 
    def __str__(self):
        return f"Stats for {self.job.title}: {self.total_area_ha} ha, {self.count} vùng"
 
    @property
    def severity_label(self):
        """Phân loại mức độ dựa trên NDVI + diện tích."""
        if self.total_area_ha > 50 or self.avg_ndvi < -0.2:
            return "Nghiêm trọng"
        elif self.total_area_ha > 20 or self.avg_ndvi < -0.1:
            return "Trung bình"
        return "Nhẹ"