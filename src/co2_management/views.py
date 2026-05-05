from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.gis.geos import Polygon
from .models import (
    Satellite, MeasurementSource, Measurement, MonitoringLocation,
    DataComparison, AnalysisJob
)
from .serializers import (
    SatelliteSerializer, MeasurementSourceSerializer, MeasurementSerializer,
    MeasurementListSerializer, MonitoringLocationSerializer,
    DataComparisonSerializer, AnalysisJobSerializer
)

class SatelliteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Satellite.objects.all()
    serializer_class = SatelliteSerializer

class MeasurementSourceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MeasurementSource.objects.all()
    serializer_class = MeasurementSourceSerializer

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def upload(self, request):
        return Response({"status": "Upload endpoint to be implemented"})

class MeasurementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Measurement.objects.filter(deleted_at__isnull=True)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return MeasurementListSerializer
        return MeasurementSerializer

    @action(detail=False, methods=['get'])
    def spatial_query(self, request):
        return Response({"status": "Spatial query endpoint to be implemented"})

class MonitoringLocationViewSet(viewsets.ModelViewSet):
    queryset = MonitoringLocation.objects.all()
    serializer_class = MonitoringLocationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    @action(detail=True, methods=['get'])
    def timeseries(self, request, pk=None):
        return Response({"status": "Timeseries endpoint to be implemented"})

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        return Response({"status": "Statistics endpoint to be implemented"})

class DataComparisonViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DataComparison.objects.all()
    serializer_class = DataComparisonSerializer

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def generate(self, request):
        return Response({"status": "Generate endpoint to be implemented"})

    @action(detail=False, methods=['get'])
    def report(self, request):
        return Response({"status": "Report endpoint to be implemented"})

class AnalysisJobViewSet(viewsets.ModelViewSet):
    queryset = AnalysisJob.objects.all()
    serializer_class = AnalysisJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return self.queryset.filter(user=self.request.user)
        return self.queryset.none()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return Response({"status": "Cancel endpoint to be implemented"})
