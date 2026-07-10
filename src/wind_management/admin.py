from django.contrib import admin
from .models import Dataset, Station, DatasetVariable, Observation, MeteorologicalEvent, RasterGranuleIndex

admin.site.register(Dataset)
admin.site.register(Station)
admin.site.register(DatasetVariable)
admin.site.register(Observation)
admin.site.register(MeteorologicalEvent)
admin.site.register(RasterGranuleIndex)
# Register your models here.
