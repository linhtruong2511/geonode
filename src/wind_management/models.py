from django.contrib.gis.db import models
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

User = get_user_model()

class Dataset(models.Model):
    CATEGORY_CHOICES = [
        ('GRIDDED', 'Gridded'),
        ('STATION', 'Station'),
        ('SATELLITE', 'Satellite'),
        ('EVENT', 'Event'),
    ]
    ACCESS_LEVEL_CHOICES = [
        ('PUBLIC', 'Public'),
        ('INTERNAL', 'Internal'),
        ('RESTRICTED', 'Restricted'),
    ]

    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES)
    description = models.TextField(null=True, blank=True)
    source_provider = models.CharField(max_length=255, null=True, blank=True)
    spatial_extent = models.PolygonField(srid=4326, null=True, blank=True)
    time_start = models.DateTimeField(null=True, blank=True)
    time_end = models.DateTimeField(null=True, blank=True)
    temporal_resolution = models.CharField(max_length=32, null=True, blank=True)
    access_level = models.CharField(max_length=16, choices=ACCESS_LEVEL_CHOICES, default='INTERNAL')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'wind_datasets'
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['access_level']),
        ]

class DatasetVariable(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='variables')
    variable_code = models.CharField(max_length=64)
    variable_name = models.CharField(max_length=255)
    unit = models.CharField(max_length=32, null=True, blank=True)

    class Meta:
        db_table = 'wind_dataset_variables'
        unique_together = ('dataset', 'variable_code')

class DatasetAccessPolicy(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='access_policies')
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='dataset_policies')
    can_view = models.BooleanField(default=True)
    can_query = models.BooleanField(default=True)
    can_download = models.BooleanField(default=False)

    class Meta:
        db_table = 'wind_dataset_access_policies'
        unique_together = ('dataset', 'group')

class Station(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.SET_NULL, null=True, blank=True, related_name='stations')
    station_code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    geom = models.PointField(srid=4326)
    elevation = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    station_type = models.CharField(max_length=32, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'wind_stations'
        unique_together = ('dataset', 'station_code')

class Observation(models.Model):
    # This table will be partitioned by PostgreSQL via migration
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='observations')
    obs_time = models.DateTimeField()
    rain_06h = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    rain_24h = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    temp_2m = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    temp_min = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    temp_max = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    humidity = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    pressure = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    wind_dir = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    wind_speed = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'wind_observations'
        indexes = [
            models.Index(fields=['station', 'obs_time']),
        ]

class MeteorologicalEvent(models.Model):
    event_name = models.CharField(max_length=255)
    event_type = models.CharField(max_length=32)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    influence_area = models.PolygonField(srid=4326, null=True, blank=True)
    max_intensity = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wind_meteorological_events'
        indexes = [
            models.Index(fields=['event_type']),
        ]

class EventTrack(models.Model):
    event = models.ForeignKey(MeteorologicalEvent, on_delete=models.CASCADE, related_name='tracks')
    track_time = models.DateTimeField()
    geom = models.PointField(srid=4326)
    intensity = models.CharField(max_length=64, null=True, blank=True)
    central_pressure = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    moving_speed_kmh = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    moving_direction = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)

    class Meta:
        db_table = 'wind_event_tracks'
        indexes = [
            models.Index(fields=['event', 'track_time']),
        ]

class RasterGranuleIndex(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='raster_granules')
    file_location = models.TextField()
    granule_time = models.DateTimeField()
    elevation = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    footprint = models.PolygonField(srid=4326)
    variable_code = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        db_table = 'wind_raster_granules_index'
        indexes = [
            models.Index(fields=['dataset', 'granule_time']),
        ]

class AnalysisJob(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    analysis_type = models.CharField(max_length=32)
    parameters = models.JSONField()
    status = models.CharField(max_length=16, default='PENDING')
    result_summary = models.JSONField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'wind_analysis_jobs'
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status']),
        ]

class AnalysisResult(models.Model):
    job = models.ForeignKey(AnalysisJob, on_delete=models.CASCADE, related_name='results')
    result_time = models.DateTimeField(null=True, blank=True)
    geom = models.GeometryField(srid=4326, null=True, blank=True)
    metric_name = models.CharField(max_length=64, null=True, blank=True)
    metric_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = 'wind_analysis_results'
        indexes = [
            models.Index(fields=['job', 'result_time']),
        ]

class ExtremeEvent(models.Model):
    job = models.ForeignKey(AnalysisJob, on_delete=models.SET_NULL, null=True, blank=True)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, null=True, blank=True)
    extreme_type = models.CharField(max_length=32)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    peak_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    threshold_used = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'wind_extreme_events'
        indexes = [
            models.Index(fields=['station', 'start_time']),
        ]

class AlertRule(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='alert_rules')
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, null=True, blank=True)
    conditions = models.JSONField(help_text="Support multiple variables. e.g. [{'var': 'wind_speed', 'op': '>', 'val': 20}]")
    area = models.PolygonField(srid=4326, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wind_alert_rules'
        indexes = [
            models.Index(fields=['user']),
        ]

class AlertNotification(models.Model):
    rule = models.ForeignKey(AlertRule, on_delete=models.CASCADE, related_name='notifications')
    triggered_at = models.DateTimeField()
    triggered_value = models.JSONField(null=True, blank=True, help_text="Values that triggered the alert")
    location = models.PointField(srid=4326, null=True, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        db_table = 'wind_alert_notifications'
        indexes = [
            models.Index(fields=['rule', '-triggered_at']),
        ]

class DownloadRequest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='download_requests')
    aoi_geom = models.GeometryField(srid=4326, null=True, blank=True)
    station_ids = models.JSONField(null=True, blank=True, help_text="List of station IDs")
    time_start = models.DateTimeField()
    time_end = models.DateTimeField()
    status = models.CharField(max_length=16, default='PENDING')
    estimated_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'wind_download_requests'
        indexes = [
            models.Index(fields=['user', '-requested_at']),
            models.Index(fields=['status']),
        ]

class DownloadRequestItem(models.Model):
    request = models.ForeignKey(DownloadRequest, on_delete=models.CASCADE, related_name='items')
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE)
    variable_codes = models.JSONField(help_text="List of variable codes")
    export_format = models.CharField(max_length=16)

    class Meta:
        db_table = 'wind_download_request_items'

class DownloadFile(models.Model):
    request = models.ForeignKey(DownloadRequest, on_delete=models.CASCADE, related_name='files')
    file_path = models.TextField()
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wind_download_files'

class UserQueryHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='query_history')
    query_type = models.CharField(max_length=32)
    parameters = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wind_user_query_history'
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

class IngestionLog(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, null=True, blank=True)
    source_file = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=16)
    records_processed = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'wind_ingestion_logs'

class SystemMetric(models.Model):
    metric_name = models.CharField(max_length=64)
    metric_value = models.DecimalField(max_digits=15, decimal_places=4)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wind_system_metrics'
        indexes = [
            models.Index(fields=['metric_name', '-recorded_at']),
        ]
