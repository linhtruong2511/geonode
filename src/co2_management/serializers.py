from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import (
    Satellite, SatelliteInstrument, MeasurementSource, MeasurementMetadata,
    Measurement, VerticalProfile, QualityAssessment, MonitoringLocation,
    DataComparison, AnalysisJob, AuditLog, Station, StationMeasurement
)

class SatelliteInstrumentSerializer(serializers.ModelSerializer):
    """Serializer cho thông tin thiết bị gắn trên vệ tinh"""
    class Meta:
        model = SatelliteInstrument
        fields = '__all__'

class SatelliteSerializer(serializers.ModelSerializer):
    """Serializer cho thông tin vệ tinh, bao gồm danh sách các thiết bị đi kèm"""
    instruments = SatelliteInstrumentSerializer(many=True, read_only=True)

    class Meta:
        model = Satellite
        fields = '__all__'

class MeasurementMetadataSerializer(serializers.ModelSerializer):
    """Serializer cho siêu dữ liệu thống kê của tệp nguồn"""
    class Meta:
        model = MeasurementMetadata
        exclude = ('source',)

class MeasurementSourceSerializer(serializers.ModelSerializer):
    """Serializer cho nguồn dữ liệu (tệp), bao gồm thông tin metadata đi kèm"""
    metadata = MeasurementMetadataSerializer(read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = MeasurementSource
        fields = '__all__'

    def get_display_name(self, obj):
        import os
        return os.path.basename(obj.file_name)

class VerticalProfileSerializer(serializers.ModelSerializer):
    """Serializer cho dữ liệu hồ sơ thẳng đứng (CO2 theo tầng khí quyển)"""
    class Meta:
        model = VerticalProfile
        exclude = ('measurement',)

class QualityAssessmentSerializer(serializers.ModelSerializer):
    """Serializer cho kết quả đánh giá chất lượng của điểm đo"""
    class Meta:
        model = QualityAssessment
        exclude = ('measurement',)

class MeasurementSerializer(GeoFeatureModelSerializer):
    """
    Serializer chi tiết cho điểm đo, hỗ trợ định dạng GeoJSON.
    Bao gồm cả dữ liệu hồ sơ thẳng đứng và kết quả đánh giá chất lượng.
    """
    profiles = VerticalProfileSerializer(many=True, read_only=True)
    quality = QualityAssessmentSerializer(read_only=True)

    class Meta:
        model = Measurement
        geo_field = 'geom' # Trường chứa dữ liệu không gian
        fields = '__all__'

class MeasurementListSerializer(serializers.ModelSerializer):
    """Serializer rút gọn cho điểm đo để hiển thị nhanh trên danh sách hoặc bản đồ"""
    class Meta:
        model = Measurement
        fields = (
            'id', 'source', 'latitude', 'longitude', 'xco2_ppm', 
            'xco2_quality_flag', 'data_source', 'measurement_time'
        )

class MonitoringLocationSerializer(GeoFeatureModelSerializer):
    """Serializer cho vị trí giám sát CO2, định dạng GeoJSON"""
    class Meta:
        model = MonitoringLocation
        geo_field = 'geom'
        fields = '__all__'

class DataComparisonSerializer(serializers.ModelSerializer):
    """Serializer cho kết quả so sánh đối chiếu giữa các nguồn dữ liệu"""
    class Meta:
        model = DataComparison
        fields = '__all__'

class AnalysisJobSerializer(serializers.ModelSerializer):
    """
    Serializer cho công việc phân tích.
    Một số trường được thiết lập chỉ đọc (read_only) để tránh người dùng tự thay đổi trạng thái.
    """
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = AnalysisJob
        fields = '__all__'
        read_only_fields = ('user', 'status', 'progress_percent', 'result_path')

class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer cho nhật ký hệ thống"""
    class Meta:
        model = AuditLog
        fields = '__all__'


class StationMeasurementSerializer(serializers.ModelSerializer):
    """Serializer cho dữ liệu đo đạc chất lượng không khí của trạm"""
    class Meta:
        model = StationMeasurement
        fields = '__all__'


class StationSerializer(serializers.ModelSerializer):
    """Serializer danh sách & thông tin chi tiết trạm quan trắc không khí"""
    measurement_count = serializers.IntegerField(read_only=True, default=0)
    latest_measurement_at = serializers.DateTimeField(read_only=True, default=None)
    available_pollutants = serializers.SerializerMethodField()

    class Meta:
        model = Station
        fields = [
            'id', 'code', 'name', 'address',
            'latitude', 'longitude', 'status', 'created_at',
            'measurement_count', 'latest_measurement_at', 'available_pollutants'
        ]

    def get_available_pollutants(self, obj):
        from .services.station_service import get_available_pollutants
        return get_available_pollutants(obj)


class StationGeoSerializer(GeoFeatureModelSerializer):
    """
    GeoJSON Serializer cho bản đồ trạm quan trắc không khí,
    tận dụng GeoFeatureModelSerializer của rest_framework_gis.
    """
    latest_measured_at = serializers.DateTimeField(read_only=True, default=None)
    latest_pm_2_5 = serializers.FloatField(read_only=True, default=None)
    latest_pm_10 = serializers.FloatField(read_only=True, default=None)
    latest_co = serializers.FloatField(read_only=True, default=None)
    latest_no2 = serializers.FloatField(read_only=True, default=None)
    latest_so2 = serializers.FloatField(read_only=True, default=None)
    latest_o3 = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = Station
        geo_field = 'geom'
        fields = [
            'id', 'code', 'name', 'address', 'status', 'created_at',
            'latest_measured_at', 'latest_pm_2_5', 'latest_pm_10',
            'latest_co', 'latest_no2', 'latest_so2', 'latest_o3'
        ]


