from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import (
    Dataset, DatasetVariable, Station, Observation,
    MeteorologicalEvent, EventTrack, RasterGranuleIndex
)

class DatasetVariableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetVariable
        fields = ['variable_code', 'variable_name', 'unit']

class DatasetSerializer(serializers.ModelSerializer):
    variables = DatasetVariableSerializer(many=True, read_only=True)

    class Meta:
        model = Dataset
        fields = [
            'id', 'code', 'name', 'category', 'description', 
            'source_provider', 'time_start', 'time_end', 
            'temporal_resolution', 'variables'
        ]
        # spatial_extent is omitted for simple list, or could use GeoFeatureModelSerializer

class StationSerializer(GeoFeatureModelSerializer):
    dataset_code = serializers.CharField(source='dataset.code', read_only=True)
    latest_observation = serializers.SerializerMethodField()

    class Meta:
        model = Station
        geo_field = 'geom'
        fields = ['id', 'station_code', 'name', 'elevation', 'station_type', 'is_active', 'dataset_code', 'latest_observation']

    def get_latest_observation(self, obj):
        latest = obj.observations.order_by('-obs_time').first()
        if latest:
            return ObservationSerializer(latest).data
        return None

class ObservationSerializer(serializers.ModelSerializer):
    station_code = serializers.CharField(source='station.station_code', read_only=True)

    class Meta:
        model = Observation
        fields = [
            'id', 'station', 'station_code', 'obs_time', 
            'rain_06h', 'rain_24h', 'temp_2m', 'temp_min', 'temp_max',
            'humidity', 'pressure', 'wind_dir', 'wind_speed'
        ]

class EventTrackSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = EventTrack
        geo_field = 'geom'
        fields = [
            'id', 'track_time', 'intensity', 'central_pressure',
            'moving_speed_kmh', 'moving_direction'
        ]

class MeteorologicalEventSerializer(GeoFeatureModelSerializer):
    tracks = EventTrackSerializer(many=True, read_only=True)

    class Meta:
        model = MeteorologicalEvent
        geo_field = 'influence_area'
        fields = [
            'id', 'event_name', 'event_type', 'start_date', 'end_date',
            'max_intensity', 'tracks'
        ]

class RasterGranuleIndexSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = RasterGranuleIndex
        geo_field = 'footprint'
        fields = [
            'id', 'dataset', 'file_location', 'granule_time', 
            'elevation', 'variable_code'
        ]
