from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import VietNamOCO2Data


class VietNamOCO2DataSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = VietNamOCO2Data
        geo_field = "location"
        id_field = "sounding_id"
        fields = (
            "sounding_id",
            "acquisition_time",
            "xco2",
            "xco2_uncertainty",
            "xco2_quality_flag",
            "latitude",
            "longitude",
            "orbit",
            "operation_mode",
            "source_file",
            "source_folder",
        )
