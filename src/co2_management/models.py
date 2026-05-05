from django.contrib.gis.db import models
from django.conf import settings

class DataSourceType(models.TextChoices):
    OCO2 = 'OCO2', 'OCO-2'
    GOSAT2 = 'GOSAT2', 'GOSAT-2'

class FileFormatType(models.TextChoices):
    NETCDF4 = 'NETCDF4', 'netCDF4'
    HDF5 = 'HDF5', 'HDF5'

class LocationType(models.TextChoices):
    CITY = 'CITY', 'City'
    REGION = 'REGION', 'Region'
    INDUSTRIAL = 'INDUSTRIAL', 'Industrial Area'
    RESEARCH = 'RESEARCH', 'Research Station'

class JobType(models.TextChoices):
    COMPARISON = 'COMPARISON', 'Comparison'
    TREND = 'TREND', 'Trend Analysis'
    ANOMALY = 'ANOMALY', 'Anomaly Detection'
    EXPORT = 'EXPORT', 'Data Export'

class JobStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    RUNNING = 'RUNNING', 'Running'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

class ComparisonType(models.TextChoices):
    SPATIAL = 'SPATIAL', 'Spatial'
    TEMPORAL = 'TEMPORAL', 'Temporal'
    RANDOM = 'RANDOM', 'Random'

class AuditAction(models.TextChoices):
    INSERT = 'INSERT', 'Insert'
    UPDATE = 'UPDATE', 'Update'
    DELETE = 'DELETE', 'Delete'
    QUERY = 'QUERY', 'Query'


class Satellite(models.Model):
    satellite_name = models.CharField(max_length=50)
    launch_date = models.DateField(null=True, blank=True)
    operator = models.CharField(max_length=100)
    orbital_altitude_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    orbital_period_minutes = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    orbital_inclination_deg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.satellite_name


class SatelliteInstrument(models.Model):
    satellite = models.ForeignKey(Satellite, on_delete=models.CASCADE, related_name='instruments')
    instrument_name = models.CharField(max_length=50)
    spectral_bands = models.IntegerField(null=True, blank=True)
    spectral_range_min_nm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    spectral_range_max_nm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    spatial_resolution_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.satellite.satellite_name} - {self.instrument_name}"


class MeasurementSource(models.Model):
    satellite = models.ForeignKey(Satellite, on_delete=models.CASCADE, related_name='sources')
    file_name = models.CharField(max_length=255)
    file_format = models.CharField(max_length=10, choices=FileFormatType.choices)
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    measurement_date = models.DateField(null=True, blank=True)
    total_soundings = models.IntegerField(null=True, blank=True)
    quality_checked = models.BooleanField(default=False)
    processing_level = models.CharField(max_length=20, null=True, blank=True)
    algorithm_version = models.CharField(max_length=50, null=True, blank=True)
    file_hash = models.CharField(max_length=64, unique=True, help_text="SHA-256 hash to prevent duplicates")

    def __str__(self):
        return self.file_name


class MeasurementMetadata(models.Model):
    source = models.OneToOneField(MeasurementSource, on_delete=models.CASCADE, related_name='metadata')
    min_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    max_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    mean_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    coverage_stats = models.JSONField(null=True, blank=True)

    def __str__(self):
        return f"Metadata for {self.source.file_name}"


class Measurement(models.Model):
    id = models.BigAutoField(primary_key=True)
    source = models.ForeignKey(MeasurementSource, on_delete=models.CASCADE, related_name='measurements')
    geom = models.PointField(srid=4326)
    latitude = models.FloatField()
    longitude = models.FloatField()
    xco2_ppm = models.FloatField()
    xco2_uncertainty_ppm = models.FloatField(null=True, blank=True)
    xco2_quality_flag = models.IntegerField(default=0)
    surface_pressure_hpa = models.FloatField(null=True, blank=True)
    solar_zenith_angle_deg = models.FloatField(null=True, blank=True)
    view_zenith_angle_deg = models.FloatField(null=True, blank=True)
    cloud_flag = models.IntegerField(null=True, blank=True)
    land_fraction = models.FloatField(null=True, blank=True)
    data_source = models.CharField(max_length=10, choices=DataSourceType.choices)
    measurement_time = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['source', 'measurement_time']),
            models.Index(fields=['data_source', 'xco2_quality_flag', 'xco2_ppm']),
        ]

    def __str__(self):
        return f"Measurement {self.id} ({self.data_source})"


class VerticalProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='profiles')
    level_index = models.IntegerField()
    pressure_hpa = models.FloatField(null=True, blank=True)
    co2_concentration_ppm = models.FloatField(null=True, blank=True)
    co2_uncertainty_ppm = models.FloatField(null=True, blank=True)
    temperature_k = models.FloatField(null=True, blank=True)
    averaging_kernel = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"Profile {self.id} for Measurement {self.measurement_id}"


class QualityAssessment(models.Model):
    measurement = models.OneToOneField(Measurement, on_delete=models.CASCADE, related_name='quality')
    quality_score = models.IntegerField(help_text="0-100")
    is_valid = models.BooleanField(default=True)
    validation_flags = models.JSONField(default=dict)
    error_messages = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Quality for Measurement {self.measurement_id}"


class MonitoringLocation(models.Model):
    location_name = models.CharField(max_length=255)
    location_type = models.CharField(max_length=20, choices=LocationType.choices)
    geom = models.PointField(srid=4326)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_km = models.FloatField()

    def __str__(self):
        return self.location_name


class TemporalSeries(models.Model):
    id = models.BigAutoField(primary_key=True)
    location = models.ForeignKey(MonitoringLocation, on_delete=models.CASCADE, related_name='series')
    measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE)
    measurement_date = models.DateField()
    xco2_ppm = models.FloatField()
    data_source = models.CharField(max_length=10, choices=DataSourceType.choices)

    def __str__(self):
        return f"Series {self.id} for {self.location.location_name}"


class DataComparison(models.Model):
    oco2_measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='oco2_comparisons')
    gosat2_measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='gosat2_comparisons')
    spatial_distance_km = models.FloatField()
    xco2_difference_ppm = models.FloatField()
    comparison_type = models.CharField(max_length=10, choices=ComparisonType.choices)

    def __str__(self):
        return f"Comparison {self.id} (Diff: {self.xco2_difference_ppm} ppm)"


class AnalysisJob(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='co2_analysis_jobs')
    job_name = models.CharField(max_length=255)
    job_type = models.CharField(max_length=20, choices=JobType.choices)
    sources = models.ManyToManyField(MeasurementSource, related_name='analysis_jobs', blank=True)
    parameters = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=JobStatus.choices, default=JobStatus.PENDING)
    progress_percent = models.IntegerField(default=0)
    result_path = models.CharField(max_length=500, null=True, blank=True)

    def __str__(self):
        return self.job_name


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='co2_audit_logs')
    action = models.CharField(max_length=10, choices=AuditAction.choices)
    table_name = models.CharField(max_length=100)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Log {self.id} - {self.action} on {self.table_name}"
