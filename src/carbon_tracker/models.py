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
