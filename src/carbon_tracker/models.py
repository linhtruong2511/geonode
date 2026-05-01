from django.contrib.gis.db import models
from django.contrib.postgres.indexes import GistIndex


class OCO2Data(models.Model):
    sounding_id = models.BigIntegerField(unique=True, primary_key=True)
    acquisition_time = models.DateTimeField()
    xco2 = models.FloatField()
    location = models.PointField(srid=4326)
    file_path = models.CharField(max_length=500)

    class Meta:
        indexes = [
            models.Index(fields=["acquisition_time"], name="carbon_oco2_acq_idx"),
            GistIndex(fields=["location"], name="carbon_oco2_loc_gix"),
        ]
        ordering = ("-acquisition_time", "-sounding_id")

    def __str__(self):
        return f"{self.sounding_id} - {self.xco2:.2f} ppm"
    

class VietNamOCO2Data(models.Model):
    sounding_id = models.BigIntegerField(primary_key=True)

    acquisition_time = models.DateTimeField(db_index=True)

    xco2 = models.FloatField()
    xco2_uncertainty = models.FloatField(null=True, blank=True)
    xco2_quality_flag = models.IntegerField(null=True, blank=True)

    latitude = models.FloatField(db_index=True)
    longitude = models.FloatField(db_index=True)
    location = models.PointField(srid=4326)

    orbit = models.IntegerField(null=True, blank=True)
    operation_mode = models.CharField(max_length=50, null=True, blank=True)

    source_file = models.CharField(max_length=500, db_index=True)
    source_folder = models.CharField(max_length=500, db_index=True)

    raw_metadata = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "carbon_tracker_vietnam_oco2data"
        ordering = ("-acquisition_time", "-sounding_id")
        # indexes = [
        #     GistIndex(fields=["location"], name="vn_oco2_location_gix"),
        #     models.Index(fields=["acquisition_time"], name="vn_oco2_time_idx"),
        #     models.Index(fields=["xco2_quality_flag"], name="vn_oco2_quality_idx"),
        #     models.Index(fields=["source_file"], name="vn_oco2_file_idx"),
        # ]

    def __str__(self):
        return f"{self.sounding_id} - {self.xco2:.2f} ppm"
