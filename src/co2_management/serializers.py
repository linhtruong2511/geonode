from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import (
    Satellite, SatelliteInstrument, MeasurementSource, MeasurementMetadata,
    Measurement, VerticalProfile, QualityAssessment, MonitoringLocation,
    DataComparison, AnalysisJob, AuditLog
)

class SatelliteInstrumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SatelliteInstrument
        fields = '__all__'

class SatelliteSerializer(serializers.ModelSerializer):
    instruments = SatelliteInstrumentSerializer(many=True, read_only=True)

    class Meta:
        model = Satellite
        fields = '__all__'

class MeasurementMetadataSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementMetadata
        exclude = ('source',)

class MeasurementSourceSerializer(serializers.ModelSerializer):
    metadata = MeasurementMetadataSerializer(read_only=True)

    class Meta:
        model = MeasurementSource
        fields = '__all__'

class VerticalProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerticalProfile
        exclude = ('measurement',)

class QualityAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = QualityAssessment
        exclude = ('measurement',)

class MeasurementSerializer(GeoFeatureModelSerializer):
    profiles = VerticalProfileSerializer(many=True, read_only=True)
    quality = QualityAssessmentSerializer(read_only=True)

    class Meta:
        model = Measurement
        geo_field = 'geom'
        fields = '__all__'

class MeasurementListSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Measurement
        geo_field = 'geom'
        fields = (
            'id', 'source', 'latitude', 'longitude', 'xco2_ppm', 
            'xco2_quality_flag', 'data_source', 'measurement_time'
        )

class MonitoringLocationSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = MonitoringLocation
        geo_field = 'geom'
        fields = '__all__'

class DataComparisonSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataComparison
        fields = '__all__'

class AnalysisJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisJob
        fields = '__all__'
        read_only_fields = ('user', 'status', 'progress_percent', 'result_path')

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
