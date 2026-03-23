"""
mining_detection/serializers.py

Serializers cho REST API — tuân theo pattern của GeoNode's ResourceBase API.
"""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import InferenceStatistics, MiningDetectionJob


class InferenceStatisticsSerializer(serializers.ModelSerializer):
    severity_label = serializers.ReadOnlyField()

    class Meta:
        model = InferenceStatistics
        exclude = ["raw_response"]  # raw_response chỉ expose qua admin/debug


class MiningDetectionJobListSerializer(serializers.ModelSerializer):
    """Serializer gọn cho list view."""
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    geonode_layer_name  = serializers.ReadOnlyField()
    statistics          = InferenceStatisticsSerializer(read_only=True)
    duration_seconds    = serializers.ReadOnlyField()

    class Meta:
        model = MiningDetectionJob
        fields = [
            "id", "job_id", "title", "status",
            "date_from", "date_to", "model_version", "cloud_cover_pct",
            "shapefile_url", "geonode_layer_name",
            "created_by_username", "created_at", "completed_at",
            "duration_seconds", "statistics",
        ]
        read_only_fields = [
            "job_id", "status", "shapefile_url", "geonode_layer_name",
            "created_at", "completed_at", "duration_seconds",
        ]


class MiningDetectionJobCreateSerializer(GeoFeatureModelSerializer):
    """
    Serializer để tạo job mới — nhận aoi_geom dưới dạng GeoJSON.
    GeoFeatureModelSerializer giúp parse geometry tự động.
    """

    class Meta:
        model = MiningDetectionJob
        geo_field = "aoi_geom"
        fields = [
            "title",
            "aoi_geom",
            "date_from",
            "date_to",
            "model_version",
            "cloud_cover_pct",
            "extra_params",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["created_by"] = request.user if request else None
        return super().create(validated_data)


class MiningDetectionJobDetailSerializer(MiningDetectionJobListSerializer):
    """Serializer đầy đủ cho detail view — thêm aoi_geom."""
    aoi_geom = serializers.SerializerMethodField()
    extra_params = serializers.JSONField()

    class Meta(MiningDetectionJobListSerializer.Meta):
        fields = MiningDetectionJobListSerializer.Meta.fields + [
            "aoi_geom", "extra_params", "error_message", "poll_count",
        ]

    def get_aoi_geom(self, obj):
        """Trả về GeoJSON của aoi_geom."""
        import json
        if obj.aoi_geom:
            return json.loads(obj.aoi_geom.geojson)
        return None