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
    """
    API ViewSet để xem danh sách và chi tiết các vệ tinh.
    Chỉ hỗ trợ đọc dữ liệu (Read-only).
    """
    queryset = Satellite.objects.all()
    serializer_class = SatelliteSerializer

class MeasurementSourceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet để quản lý các tệp nguồn dữ liệu.
    """
    queryset = MeasurementSource.objects.all()
    serializer_class = MeasurementSourceSerializer

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def upload(self, request):
        """Action phục vụ việc tải lên tệp dữ liệu mới (Sẽ được triển khai)"""
        return Response({"status": "Upload endpoint to be implemented"})

class MeasurementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet cho dữ liệu đo đạc chi tiết.
    Hỗ trợ bộ lọc nâng cao và truy vấn theo không gian.
    """
    queryset = Measurement.objects.filter(deleted_at__isnull=True)
    
    def get_serializer_class(self):
        """Sử dụng Serializer rút gọn cho danh sách và Serializer đầy đủ cho chi tiết"""
        if self.action == 'list':
            return MeasurementListSerializer
        return MeasurementSerializer

    def get_queryset(self):
        """Xử lý các bộ lọc từ query parameters"""
        qs = super().get_queryset().select_related("source")
        
        # Lọc theo tệp nguồn cụ thể (MeasurementSource ID)
        source_id = self.request.query_params.get("source_id")
        if source_id:
            qs = qs.filter(source_id=source_id)

        # Lọc theo loại nguồn (OCO2/GOSAT2)
        src = self.request.query_params.get("source")
        if src:
            qs = qs.filter(data_source=src)
            
        # Lọc theo chất lượng (0: Tốt)
        q_flag = self.request.query_params.get("quality")
        if q_flag == '0':
            qs = qs.filter(xco2_quality_flag=0)
            
        # Lọc theo dải nồng độ XCO2
        min_xco2 = self.request.query_params.get("min_xco2")
        if min_xco2:
            qs = qs.filter(xco2_ppm__gte=float(min_xco2))
            
        max_xco2 = self.request.query_params.get("max_xco2")
        if max_xco2:
            qs = qs.filter(xco2_ppm__lte=float(max_xco2))
            
        # Lọc theo thời gian
        date_from = self.request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(measurement_time__date__gte=date_from)
            
        date_to = self.request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(measurement_time__date__lte=date_to)
            
        # Lọc theo vùng quan sát (Bounding Box)
        min_lat = self.request.query_params.get("min_lat")
        max_lat = self.request.query_params.get("max_lat")
        min_lon = self.request.query_params.get("min_lon")
        max_lon = self.request.query_params.get("max_lon")
        
        if min_lat and max_lat and min_lon and max_lon:
            qs = qs.filter(
                latitude__gte=float(min_lat),
                latitude__lte=float(max_lat),
                longitude__gte=float(min_lon),
                longitude__lte=float(max_lon)
            )
        
        # Lọc theo vùng hình học tùy ý (WKT Polygon/Rectangle)
        geometry_wkt = self.request.query_params.get("geometry")
        if geometry_wkt:
            try:
                from django.contrib.gis.geos import GEOSGeometry
                geom = GEOSGeometry(geometry_wkt, srid=4326)
                qs = qs.filter(geom__intersects=geom)
            except Exception as e:
                logger.error(f"Spatial filter error: {e}")
            
        return qs.order_by("-measurement_time")

    @action(detail=False, methods=['get'])
    def spatial_query(self, request):
        """
        Action trả về dữ liệu GeoJSON phục vụ hiển thị trên bản đồ.
        Giới hạn số lượng điểm để đảm bảo hiệu năng trình duyệt.
        """
        qs = self.get_queryset()
        
        limit = request.query_params.get("limit", 1000)
        qs = qs[:int(limit)]
        
        serializer = MeasurementListSerializer(qs, many=True)
        return Response(serializer.data)

class MonitoringLocationViewSet(viewsets.ModelViewSet):
    """
    API ViewSet quản lý các vị trí giám sát CO2.
    """
    queryset = MonitoringLocation.objects.all()
    serializer_class = MonitoringLocationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    @action(detail=True, methods=['get'])
    def timeseries(self, request, pk=None):
        """
        Truy vấn chuỗi thời gian nồng độ XCO2 cho vị trí này.
        Sử dụng bảng TemporalSeries đã được tổng hợp trước để tối ưu tốc độ.
        """
        location = self.get_object()
        from .models import TemporalSeries
        from django.db.models import Avg
        
        # Lấy dữ liệu từ bảng TemporalSeries (đã được ImportService populate)
        qs = location.series.values('measurement_date', 'data_source').annotate(
            avg_xco2=Avg('xco2_ppm')
        ).order_by('measurement_date')

        # Định dạng lại dữ liệu cho Chart.js
        datasets = {
            'OCO2': {'label': 'OCO-2', 'data': [], 'borderColor': '#397aab', 'backgroundColor': 'rgba(57, 122, 171, 0.1)'},
            'GOSAT2': {'label': 'GOSAT-2', 'data': [], 'borderColor': '#e74c3c', 'backgroundColor': 'transparent'}
        }
        
        for entry in qs:
            src = entry['data_source']
            if src in datasets:
                datasets[src]['data'].append({
                    'x': entry['measurement_date'].isoformat(),
                    'y': round(entry['avg_xco2'], 2)
                })

        return Response({
            "location_name": location.location_name,
            "datasets": list(datasets.values())
        })

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """Lấy thống kê tổng hợp (Min, Max, Mean) cho vị trí này."""
        location = self.get_object()
        from django.contrib.gis.measure import D
        from django.db.models import Avg, Max, Min, Count
        
        stats = Measurement.objects.filter(
            geom__distance_lte=(location.geom, D(km=location.radius_km)),
            deleted_at__isnull=True
        ).aggregate(
            avg_xco2=Avg('xco2_ppm'),
            max_xco2=Max('xco2_ppm'),
            min_xco2=Min('xco2_ppm'),
            total_count=Count('id')
        )
        
        return Response(stats)

class DataComparisonViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet cho các kết quả so sánh đối chiếu dữ liệu.
    """
    queryset = DataComparison.objects.all()
    serializer_class = DataComparisonSerializer

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def generate(self, request):
        """Khởi tạo một quy trình so sánh mới (Sẽ được triển khai)"""
        return Response({"status": "Generate endpoint to be implemented"})

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Lấy báo cáo so sánh chi tiết (Sẽ được triển khai)"""
        return Response({"status": "Report endpoint to be implemented"})

class AnalysisJobViewSet(viewsets.ModelViewSet):
    """
    API ViewSet quản lý các công việc phân tích của người dùng.
    Người dùng chỉ nhìn thấy và quản lý các công việc do chính mình tạo ra.
    """
    queryset = AnalysisJob.objects.all()
    serializer_class = AnalysisJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Lọc danh sách công việc theo người dùng hiện tại"""
        if self.request.user.is_authenticated:
            return self.queryset.filter(user=self.request.user)
        return self.queryset.none()

    def perform_create(self, serializer):
        """Gán người dùng hiện tại vào trường 'user' khi tạo mới"""
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Action để hủy bỏ một công việc đang chạy (Sẽ được triển khai)"""
        return Response({"status": "Cancel endpoint to be implemented"})
