import uuid

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class JobStatus(models.TextChoices):
    PENDING = "PENDING", _("Pending")
    RUNNING = "RUNNING", _("Running")
    COMPLETED = "COMPLETED", _("Completed")
    FAILED = "FAILED", _("Failed")


class MiningDetectionJob(models.Model):
    job_id = models.UUIDField(
        unique=True,
        default=uuid.uuid4,
        help_text=_("UUID tra ve tu AI service (POST /analyze -> job_id)"),
    )
    title = models.CharField(
        max_length=255,
        help_text=_("Ten mo ta cho phien phan tich."),
    )
    aoi_geom = gis_models.PolygonField(
        srid=4326,
        help_text=_("Vung phan tich (AOI) duoi dang Polygon WGS84."),
        null=True,
        blank=True,
    )
    date_from = models.DateField(
        help_text=_("Ngay bat dau lay anh Sentinel-2"),
        null=True,
        blank=True,
    )
    date_to = models.DateField(
        help_text=_("Ngay ket thuc lay anh Sentinel-2"),
        null=True,
        blank=True,
    )
    model_version = models.CharField(
        max_length=64,
        default="v2.1-sentinel",
        help_text=_("Phien ban model AI duoc su dung"),
    )
    cloud_cover_pct = models.FloatField(
        default=20.0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text=_("Nguong may toi da cho phep (%) khi lay anh WCS"),
    )
    extra_params = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Tham so bo sung gui toi AI service"),
    )
    status = models.CharField(
        max_length=16,
        choices=JobStatus.choices,
        default=JobStatus.PENDING,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    poll_count = models.PositiveIntegerField(
        default=0,
        help_text=_("So lan Celery da poll /status tu AI service"),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="mining_jobs",
        help_text=_("User tao job"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    result_dataset = models.OneToOneField(
        "layers.Dataset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_detection_job",
        help_text=_("GeoNode Dataset duoc upload tu AI service."),
    )
    tif_result_dataset = models.OneToOneField(
        "layers.Dataset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tiff_mining_detection_job",
        help_text=_("GeoNode Tiff Dataset duoc upload tu AI service."),
    )
    
    base_dataset = models.ForeignKey(
        "layers.Dataset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_jobs_as_base",
        help_text=_("Dataset goc ma job nay dua tren."),
    )
    shapefile_url = models.URLField(
        blank=True,
        null=True,
        help_text=_("URL layer tren GeoNode"),
    )
    result_execution_id = models.CharField(max_length=255, blank=True, null=True)
    message_progress = models.CharField(max_length=255, default="", blank=True, null=True)
    progress_percentage = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )

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
        if self.completed_at and self.created_at:
            return int((self.completed_at - self.created_at).total_seconds())
        return None

    @property
    def geonode_layer_name(self):
        if self.result_dataset:
            return self.result_dataset.alternate
        return None

    @property
    def is_editable(self):
        return self.status in {JobStatus.PENDING, JobStatus.FAILED}

    @property
    def can_delete(self):
        return self.status != JobStatus.RUNNING


class InferenceStatistics(models.Model):
    job = models.OneToOneField(
        MiningDetectionJob,
        on_delete=models.CASCADE,
        related_name="statistics",
        primary_key=True,
    )
    total_area_ha = models.FloatField(help_text=_("Tong dien tich khai thac (ha)"))
    count = models.PositiveIntegerField(help_text=_("So luong vung phat hien"))
    max_area_ha = models.FloatField(help_text=_("Dien tich vung lon nhat"))
    min_area_ha = models.FloatField(help_text=_("Dien tich vung nho nhat"))
    avg_ndvi = models.FloatField(help_text=_("NDVI trung binh"))
    avg_ndwi = models.FloatField(help_text=_("NDWI trung binh"))
    avg_bsi = models.FloatField(help_text=_("BSI trung binh"))
    raw_response = models.JSONField(default=dict, help_text=_("Full JSON response"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Inference statistics")
        verbose_name_plural = _("Inference statistics")

    def __str__(self):
        return f"Stats for {self.job.title}: {self.total_area_ha} ha, {self.count} regions"

    @property
    def severity_label(self):
        if self.total_area_ha > 50 or self.avg_ndvi < -0.2:
            return "Nghiem trong"
        if self.total_area_ha > 20 or self.avg_ndvi < -0.1:
            return "Trung binh"
        return "Nhe"


class MineralType(models.Model):
    code = models.CharField(max_length=50, unique=True, verbose_name="Code")
    name = models.CharField(max_length=200, verbose_name="Name")
    description = models.TextField(blank=True, verbose_name="Description")

    class Meta:
        db_table = "mineral_type"
        verbose_name = "Mineral Type"
        verbose_name_plural = "Mineral Types"
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class CoordinateSystem(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Name")
    central_meridian = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name="Central Meridian",
    )
    projection_zone = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        verbose_name="Projection Zone",
    )
    description = models.TextField(blank=True, verbose_name="Description")

    class Meta:
        db_table = "coordinate_system"
        verbose_name = "Coordinate System"
        verbose_name_plural = "Coordinate Systems"

    def __str__(self):
        return self.name


class Province(models.Model):
    name = models.CharField(max_length=100, verbose_name="Province Name")
    code = models.CharField(max_length=20, unique=True, verbose_name="Code")

    class Meta:
        db_table = "province"
        verbose_name = "Province"
        verbose_name_plural = "Provinces"

    def __str__(self):
        return self.name


class District(models.Model):
    province = models.ForeignKey(
        Province,
        on_delete=models.PROTECT,
        related_name="districts",
        verbose_name="Province",
    )
    name = models.CharField(max_length=100, verbose_name="District Name")
    code = models.CharField(max_length=20, unique=True, verbose_name="Code")

    class Meta:
        db_table = "district"
        verbose_name = "District"
        verbose_name_plural = "Districts"

    def __str__(self):
        return f"{self.name}, {self.province.name}"


class Ward(models.Model):
    district = models.ForeignKey(
        District,
        on_delete=models.PROTECT,
        related_name="wards",
        verbose_name="District",
    )
    name = models.CharField(max_length=100, verbose_name="Ward Name")
    code = models.CharField(max_length=20, unique=True, verbose_name="Code")

    class Meta:
        db_table = "ward"
        verbose_name = "Ward"
        verbose_name_plural = "Wards"

    def __str__(self):
        return f"{self.name}, {self.district.name}"


class PlanningZone(models.Model):
    code = models.CharField(max_length=50, unique=True, verbose_name="Planning Code")
    description = models.TextField(blank=True, verbose_name="Description")
    approved_date = models.DateField(null=True, blank=True, verbose_name="Approved Date")
    document_reference = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Document Reference",
    )

    class Meta:
        db_table = "planning_zone"
        verbose_name = "Planning Zone"
        verbose_name_plural = "Planning Zones"

    def __str__(self):
        return self.code


class MiningSite(models.Model):
    class StatusChoices(models.TextChoices):
        PLANNED = "planned", _("Planned")
        LICENSED = "licensed", _("Licensed")
        ACTIVE = "active", _("Active")
        SUSPENDED = "suspended", _("Suspended")
        EXHAUSTED = "exhausted", _("Exhausted")
        RESTORED = "restored", _("Restored")

    serial_number = models.PositiveIntegerField(verbose_name="Serial Number")
    name = models.CharField(max_length=255, verbose_name="Site Name")
    mineral_type = models.ForeignKey(
        MineralType,
        on_delete=models.PROTECT,
        related_name="mining_sites",
        verbose_name="Mineral Type",
    )
    ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="mining_sites",
        null=True,
        blank=True,
        verbose_name="Ward",
    )
    location_description = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Location Description",
    )
    area_ha = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(0)],
        verbose_name="Area (ha)",
    )
    estimated_reserve_m3 = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Estimated Reserve (m3)",
    )
    planning_zone = models.ForeignKey(
        PlanningZone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_sites",
        verbose_name="Planning Zone",
    )
    coordinate_system = models.ForeignKey(
        CoordinateSystem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="mining_sites",
        verbose_name="Coordinate System",
    )
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PLANNED,
        verbose_name="Status",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Updated At")
    notes = models.TextField(blank=True, verbose_name="Notes")
    is_auto_monitoring = models.BooleanField(default=False, verbose_name="Tự động giám sát")
    monitoring_datasets = models.ManyToManyField(
        "layers.Dataset",
        blank=True,
        related_name="monitored_mining_sites",
        verbose_name="Monitoring Datasets",
    )
    monitoring_dataset_cloud_cover = models.IntegerField(default=20, validators=[MinValueValidator(0), MaxValueValidator(100)], verbose_name="Monitoring Dataset Cloud Cover (%)")
    auto_monitoring_interval_days = models.PositiveIntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(365)],
        verbose_name="Auto Monitoring Interval (days)",
    )
    auto_monitoring_model_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Auto Monitoring Model ID",
    )
    auto_monitoring_inference_params = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Auto Monitoring Inference Params",
    )
    auto_monitoring_last_requested_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Auto Monitoring Last Requested At",
    )
    
    
    class Meta:
        db_table = "mining_site"
        verbose_name = "Mining Site"
        verbose_name_plural = "Mining Sites"
        ordering = ["serial_number"]

    def __str__(self):
        return f"[{self.serial_number}] {self.name}"

    @property
    def has_map_geometry(self):
        return self.boundary_points.filter(
            latitude__isnull=False,
            longitude__isnull=False,
        ).count() >= 3

    def get_latlon_bounds(self):
        return self.boundary_points.filter(
            latitude__isnull=False,
            longitude__isnull=False,
        ).aggregate(
            min_lon=models.Min("longitude"),
            max_lon=models.Max("longitude"),
            min_lat=models.Min("latitude"),
            max_lat=models.Max("latitude"),
        )
        

class BoundaryPoint(models.Model):
    mining_site = models.ForeignKey(
        MiningSite,
        on_delete=models.CASCADE,
        related_name="boundary_points",
        verbose_name="Mining Site",
    )
    point_order = models.PositiveSmallIntegerField(verbose_name="Point Order")
    x = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="X Coordinate (m)",
    )
    y = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Y Coordinate (m)",
    )
    latitude = models.DecimalField(
        max_digits=12,
        decimal_places=8,
        null=True,
        blank=True,
        verbose_name="Latitude (WGS84)",
    )
    longitude = models.DecimalField(
        max_digits=12,
        decimal_places=8,
        null=True,
        blank=True,
        verbose_name="Longitude (WGS84)",
    )

    class Meta:
        db_table = "boundary_point"
        verbose_name = "Boundary Point"
        verbose_name_plural = "Boundary Points"
        ordering = ["mining_site", "point_order"]
        unique_together = [("mining_site", "point_order")]

    def __str__(self):
        return f"{self.mining_site} - Point {self.point_order} ({self.x}, {self.y})"

    def clean(self):
        has_xy = self.x is not None and self.y is not None
        has_latlng = self.latitude is not None and self.longitude is not None

        if (self.x is None) ^ (self.y is None):
            raise ValidationError(_("X/Y phai duoc nhap du ca cap hoac de trong ca hai."))
        if (self.latitude is None) ^ (self.longitude is None):
            raise ValidationError(_("Latitude/longitude phai duoc nhap du ca cap hoac de trong ca hai."))
        if not has_xy and not has_latlng:
            raise ValidationError(
                _("Moi diem ranh gioi phai co it nhat mot cap toa do hop le (X/Y hoac latitude/longitude).")
            )


class MonitoringRecord(models.Model):
    class PeriodChoices(models.TextChoices):
        DAILY = "daily", _("Daily")
        WEEKLY = "weekly", _("Weekly")
        MONTHLY = "monthly", _("Monthly")
        QUARTERLY = "quarterly", _("Quarterly")
        YEARLY = "yearly", _("Yearly")

    mining_site = models.ForeignKey(
        MiningSite,
        on_delete=models.PROTECT,
        related_name="monitoring_records",
        verbose_name="Mining Site",
    )
    recorded_at = models.DateTimeField(verbose_name="Recorded At")
    period_type = models.CharField(
        max_length=20,
        choices=PeriodChoices.choices,
        default=PeriodChoices.MONTHLY,
        verbose_name="Period Type",
    )
    actual_extraction_m3 = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Actual Extraction (m3)",
    )
    remaining_reserve_m3 = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Remaining Reserve (m3)",
    )
    inspector = models.CharField(max_length=200, blank=True, verbose_name="Inspector")
    violations_noted = models.BooleanField(default=False, verbose_name="Violations Noted")
    notes = models.TextField(blank=True, verbose_name="Notes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monitoring_record"
        verbose_name = "Monitoring Record"
        verbose_name_plural = "Monitoring Records"
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.mining_site} - {self.recorded_at.date()}"


class Violation(models.Model):
    class SeverityChoices(models.TextChoices):
        LOW = "low", _("Low")
        MEDIUM = "medium", _("Medium")
        HIGH = "high", _("High")

    class StatusChoices(models.TextChoices):
        OPEN = "open", _("Open")
        RESOLVED = "resolved", _("Resolved")
        CLOSED = "closed", _("Closed")

    monitoring_record = models.ForeignKey(
        MonitoringRecord,
        on_delete=models.CASCADE,
        related_name="violations",
        verbose_name="Monitoring Record",
    )
    description = models.TextField(verbose_name="Description")
    severity = models.CharField(
        max_length=10,
        choices=SeverityChoices.choices,
        default=SeverityChoices.LOW,
        verbose_name="Severity",
    )
    status = models.CharField(
        max_length=10,
        choices=StatusChoices.choices,
        default=StatusChoices.OPEN,
        verbose_name="Status",
    )
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name="Resolved At")
    penalty_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Penalty Amount (VND)",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "violation"
        verbose_name = "Violation"
        verbose_name_plural = "Violations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity.upper()}] {self.monitoring_record} - {self.description[:60]}"
