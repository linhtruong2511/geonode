from django.db import models
from django.conf import settings
from geonode.layers.models import Dataset


class Analysis(models.Model):
    """
    Represents a single inference run sent to the AI Mining Detection Service.
    Each record tracks: the source raster, job lifecycle, input parameters,
    and the final statistics returned by the AI worker.
    """

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )

    # --- Source Dataset ---
    target_dataset = models.ForeignKey(
        Dataset,
        related_name='derived_analyses',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Source Raster Dataset"
    )

    # --- Job Identity ---
    job_id = models.CharField(
        max_length=255, null=True, blank=True, unique=True,
        verbose_name="AI Service Job ID"
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='PENDING',
        db_index=True
    )
    error_message = models.TextField(null=True, blank=True)

    # --- Metadata ---
    title = models.CharField(max_length=255, null=True, blank=True)
    name = models.CharField(max_length=255, null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='analyses'
    )
    mask_type = models.CharField(max_length=100, default="open_pit_mine")
    analysis_date = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # --- Input Parameters snapshot (sent to AI service) ---
    input_params = models.JSONField(
        null=True, blank=True,
        verbose_name="AI Input Parameters",
        help_text="Parameters sent to the AI service (threshold, tile size, etc.)"
    )

    # --- Result: Statistics ---
    total_area_ha = models.FloatField(null=True, blank=True)
    count = models.IntegerField(null=True, blank=True)
    max_area_ha = models.FloatField(null=True, blank=True)
    min_area_ha = models.FloatField(null=True, blank=True)
    avg_ndvi = models.FloatField(null=True, blank=True)
    avg_ndwi = models.FloatField(null=True, blank=True)
    avg_bsi = models.FloatField(null=True, blank=True)

    # --- Result: Uploaded Layer ---
    shapefile_url = models.URLField(
        null=True, blank=True,
        verbose_name="Resulting Layer URL",
        help_text="URL of the shapefile layer uploaded back to GeoNode"
    )

    # --- Raw result blob (full response from AI service) ---
    result_metadata = models.JSONField(
        null=True, blank=True,
        verbose_name="Full AI Result Metadata",
        help_text="Raw JSON result payload from the AI service"
    )

    class Meta:
        ordering = ['-analysis_date']
        verbose_name = "Inference Run"
        verbose_name_plural = "Inference Runs"

    def __str__(self):
        return f"[{self.status}] {self.title or self.job_id}"

    def apply_result(self, result_data: dict):
        """
        Helper to apply the result JSON from the AI /result/<job_id> endpoint.
        Call .save() after calling this method.
        """
        stats = result_data.get('statistics', {})
        self.total_area_ha = stats.get('total_area_ha')
        self.count = stats.get('count')
        self.max_area_ha = stats.get('max_area_ha')
        self.min_area_ha = stats.get('min_area_ha')
        self.avg_ndvi = stats.get('avg_ndvi')
        self.avg_ndwi = stats.get('avg_ndwi')
        self.avg_bsi = stats.get('avg_bsi')
        self.shapefile_url = result_data.get('shapefile_url')
        self.result_metadata = result_data
        self.status = 'COMPLETED'