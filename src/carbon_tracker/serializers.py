from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import OCO2Data


class OCO2DataSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = OCO2Data
        geo_field = "location"
        id_field = "sounding_id"
        fields = ("sounding_id", "acquisition_time", "xco2", "file_path")
