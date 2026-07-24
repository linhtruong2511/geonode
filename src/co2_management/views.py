from django.http import HttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import Count, Avg, Max, Min, StdDev, Q
from django.db.models.functions import TruncMonth, TruncYear
from django.contrib.gis.measure import D
from django.db.models import Avg, Max, Min, Count, Case, When, Value, CharField, F, FloatField
import numpy as np
import logging
from django.contrib.gis.geos import Polygon
from .models import (
    Satellite, MeasurementSource, Measurement, MonitoringLocation,
    DataComparison, AnalysisJob, JobStatus, Station, StationMeasurement
)
from .serializers import (
    SatelliteSerializer, MeasurementSourceSerializer, MeasurementSerializer,
    MeasurementListSerializer, MonitoringLocationSerializer,
    DataComparisonSerializer, AnalysisJobSerializer, StationSerializer,
    StationMeasurementSerializer, StationGeoSerializer
)
from .services.station_service import (
    filter_stations, get_station_stats, get_stations_geojson,
    import_stations_from_csv, generate_station_csv_template,
    filter_measurements, get_latest_measurements_per_station,
    generate_measurement_csv_template, import_measurements_bulk_csv,
    import_station_measurements_csv, export_measurements_csv
)
from .tasks import import_data_file_task

logger = logging.getLogger(__name__)
class StandardLimitOffsetPagination(LimitOffsetPagination):
    """
    Phân trang mặc định cho các API CO2 Management.
    Sử dụng Limit/Offset để phù hợp với frontend React.
    Tăng max_limit lên 1000 để hỗ trợ hiển thị đồng bộ 500 và 1000 bản ghi trên bản đồ/bảng.
    """
    default_limit = 10
    max_limit = 1000

class SatelliteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet để xem danh sách và chi tiết các vệ tinh.
    Chỉ hỗ trợ đọc dữ liệu (Read-only).
    """
    queryset = Satellite.objects.all()
    serializer_class = SatelliteSerializer
    pagination_class = StandardLimitOffsetPagination

class MeasurementSourceViewSet(viewsets.ModelViewSet):
    """
    API ViewSet để quản lý các tệp nguồn dữ liệu.
    Hỗ trợ đầy đủ thêm, sửa, xóa tệp nguồn và bulk delete.
    """
    queryset = MeasurementSource.objects.all()
    serializer_class = MeasurementSourceSerializer
    pagination_class = StandardLimitOffsetPagination
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        """Xử lý bộ lọc tham số tìm kiếm từ frontend"""
        qs = super().get_queryset().select_related("satellite")
        
        # Lọc theo loại vệ tinh (Satellite Name/Type)
        satellite_name = self.request.query_params.get("satellite")
        if satellite_name:
            if satellite_name == 'OCO2':
                qs = qs.filter(satellite__satellite_name__icontains="OCO")
            elif satellite_name == 'GOSAT2':
                qs = qs.filter(satellite__satellite_name__icontains="GOSAT")
            else:
                qs = qs.filter(satellite__satellite_name__icontains=satellite_name)
                
        # Lọc theo định dạng tệp (NETCDF4/HDF5)
        file_format = self.request.query_params.get("format")
        if file_format:
            qs = qs.filter(file_format=file_format)
            
        # Lọc theo trạng thái kiểm định chất lượng (0: Chờ xử lý, 1: Đã xong)
        quality_checked = self.request.query_params.get("quality_checked")
        if quality_checked == '1':
            qs = qs.filter(quality_checked=True)
        elif quality_checked == '0':
            qs = qs.filter(quality_checked=False)
            
        # Lọc theo khoảng thời gian thực hiện phép đo (Từ ngày / Đến ngày)
        date_from = self.request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(measurement_date__gte=date_from)
            
        date_to = self.request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(measurement_date__lte=date_to)
            
        return qs.order_by("-id")

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def upload(self, request):
        """Action phục vụ việc tải lên tệp dữ liệu mới"""
        from django.conf import settings
        from rest_framework.parsers import MultiPartParser, FormParser
        import hashlib
        import os

        # Sử dụng parser upload file
        uploaded_file = request.FILES.get('file')
        satellite_id = request.data.get('satellite_id')

        if not uploaded_file:
            return Response({"error": "Không có tệp nào được gửi lên"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Tính hash SHA-256
        sha = hashlib.sha256()
        for chunk in uploaded_file.chunks():
            sha.update(chunk)
        file_hash = sha.hexdigest()

        # 2. Kiểm tra xem file đã được import chưa
        if MeasurementSource.objects.filter(file_hash=file_hash).exists():
            existing = MeasurementSource.objects.get(file_hash=file_hash)
            return Response({
                "status": "exists",
                "message": "Tệp tin này đã tồn tại trong hệ thống.",
                "data": MeasurementSourceSerializer(existing).data
            }, status=status.HTTP_200_OK)

        # 3. Xác định format
        filename = uploaded_file.name
        ext = os.path.splitext(filename)[1].lower()
        if ext == '.nc4':
            file_format = 'NETCDF4'
        elif ext in ['.h5', '.hdf5']:
            file_format = 'HDF5'
        else:
            return Response({"error": "Định dạng tệp không được hỗ trợ (chỉ hỗ trợ .nc4 hoặc .h5)"}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Xác định vệ tinh
        satellite = None
        if satellite_id:
            try:
                satellite = Satellite.objects.get(id=satellite_id)
            except Satellite.DoesNotExist:
                return Response({"error": f"Không tìm thấy Vệ tinh với ID={satellite_id}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Tự động phát hiện dựa trên định dạng
            sat_name = "OCO-2" if file_format == 'NETCDF4' else "GOSAT-2"
            satellite, _ = Satellite.objects.get_or_create(
                satellite_name=sat_name,
                defaults={"operator": "NASA" if sat_name == "OCO-2" else "JAXA", "is_active": True}
            )

        # 5. Lưu file vào đĩa
        media_dir = os.path.join(settings.MEDIA_ROOT, 'co2_sources')
        os.makedirs(media_dir, exist_ok=True)
        file_path = os.path.join(media_dir, filename)
        
        # Tránh ghi đè file có cùng tên
        counter = 1
        base_name, extension = os.path.splitext(filename)
        while os.path.exists(file_path):
            filename = f"{base_name}_{counter}{extension}"
            file_path = os.path.join(media_dir, filename)
            counter += 1

        with open(file_path, 'wb+') as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        # 6. Tạo MeasurementSource
        file_size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 2)
        
        # Trích xuất phiên bản thuật toán từ tên file
        alg_version = "N/A"
        try:
            if file_format == 'HDF5':
                alg_version = filename.split("_")[1][:9]
            elif file_format == 'NETCDF4':
                alg_version = filename.split("_")[1]
        except Exception:
            pass

        source = MeasurementSource.objects.create(
            satellite=satellite,
            file_name=file_path,
            file_format=file_format,
            file_size_mb=file_size_mb,
            quality_checked=False,
            processing_level="L2",
            algorithm_version=alg_version,
            file_hash=file_hash
        )

        return Response({
            "status": "created",
            "message": "Tải lên tệp thành công.",
            "data": MeasurementSourceSerializer(source).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def import_file(self, request, pk=None):
        """Action kích hoạt tác vụ import dữ liệu từ file thô"""
        import os
        instance = self.get_object()
        quality_only = request.data.get('quality_only', True)
        bbox = request.data.get('bbox', None) # ví dụ: [8, 102, 24, 110]
        
        import_data_file_task.delay(instance.pk, quality_only=quality_only, bbox=bbox)
        return Response({
            "status": "success", 
            "message": f"Đã bắt đầu quy trình nhập dữ liệu cho tệp {os.path.basename(instance.file_name)}. Vui lòng chờ vài phút."
        })

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def bulk_delete(self, request):
        """
        Xóa hàng loạt tệp nguồn dữ liệu được chọn.
        Do cấu hình CASCADE ở models, toàn bộ điểm đo thuộc các file này cũng sẽ bị xóa ở DB.
        """
        ids = request.data.get('ids', [])
        if not ids:
            return Response({"error": "Không có ID nào được chọn"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Thực hiện xóa các nguồn (cascade tự động xóa measurements)
        deleted_count = MeasurementSource.objects.filter(id__in=ids).delete()[0]
        return Response({
            "status": "success", 
            "message": f"Đã xóa thành công {deleted_count} tệp nguồn dữ liệu và toàn bộ điểm đo liên quan."
        })

class MeasurementViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho dữ liệu đo đạc chi tiết.
    Hỗ trợ bộ lọc nâng cao, truy vấn không gian, xóa mềm và cập nhật hàng loạt.
    """
    queryset = Measurement.objects.filter(deleted_at__isnull=True)
    pagination_class = StandardLimitOffsetPagination
    
    def destroy(self, request, *args, **kwargs):
        """
        Thực hiện xóa mềm một điểm đo bằng cách cập nhật trường deleted_at.
        """
        instance = self.get_object()
        from django.utils import timezone
        instance.deleted_at = timezone.now()
        instance.save()
        return Response({"status": "success", "message": "Đã xóa mềm điểm đo thành công"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def bulk_delete(self, request):
        """
        Xóa mềm hàng loạt điểm đo được chọn bằng cách cập nhật trường deleted_at.
        """
        ids = request.data.get('ids', [])
        if not ids:
            return Response({"error": "Không có ID nào được chọn"}, status=status.HTTP_400_BAD_REQUEST)
        from django.utils import timezone
        count = Measurement.objects.filter(id__in=ids, deleted_at__isnull=True).update(deleted_at=timezone.now())
        return Response({"status": "success", "message": f"Đã xóa mềm thành công {count} điểm đo"})

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def bulk_toggle_quality(self, request):
        """
        Bật/tắt cờ chất lượng (0: Tốt, 1: Kém) hàng loạt điểm đo.
        Khi đặt là Kém (1), bản ghi sẽ bị ẩn đi nếu người dùng lọc 'Chỉ dữ liệu tốt'.
        """
        ids = request.data.get('ids', [])
        quality_flag = int(request.data.get('quality_flag', 1))
        if not ids:
            return Response({"error": "Không có ID nào được chọn"}, status=status.HTTP_400_BAD_REQUEST)
        
        count = Measurement.objects.filter(id__in=ids, deleted_at__isnull=True).update(xco2_quality_flag=quality_flag)
        return Response({
            "status": "success", 
            "message": f"Đã cập nhật trạng thái chất lượng cho {count} điểm đo sang: " + ("Kém" if quality_flag == 1 else "Tốt")
        })
    
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
    pagination_class = StandardLimitOffsetPagination

    @action(detail=True, methods=['get'])
    def timeseries(self, request, pk=None):
        """
        Truy vấn chuỗi thời gian nồng độ XCO2 cho vị trí này.
        Sử dụng bảng TemporalSeries đã được tổng hợp trước để tối ưu tốc độ.
        """
        location = self.get_object()
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
    pagination_class = StandardLimitOffsetPagination

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def generate(self, request):
        """Khởi tạo một quy trình so sánh mới (Sẽ được triển khai)"""
        return Response({"status": "Generate endpoint to be implemented"})

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Lấy báo cáo so sánh chi tiết"""
        job_id = request.query_params.get('job_id')
        qs = DataComparison.objects.select_related(
            'oco2_measurement', 'gosat2_measurement', 'job'
        )
        if job_id:
            qs = qs.filter(job_id=job_id)

        count = qs.count()
        if count == 0:
            return Response({"no_data": True, "total_pairs": 0})

        rows = list(qs.values(
            'xco2_difference_ppm',
            'spatial_distance_km',
            'oco2_measurement__xco2_ppm',
            'gosat2_measurement__xco2_ppm',
            'oco2_measurement__measurement_time',
        ))

        diffs      = np.array([r['xco2_difference_ppm']            for r in rows], dtype=float)
        distances  = np.array([r['spatial_distance_km']            for r in rows], dtype=float)
        oco2_vals  = np.array([r['oco2_measurement__xco2_ppm']     for r in rows], dtype=float)
        gosat2_vals= np.array([r['gosat2_measurement__xco2_ppm']   for r in rows], dtype=float)

        bias = float(np.mean(diffs))
        rmse = float(np.sqrt(np.mean(diffs ** 2)))
        std  = float(np.std(diffs))
        mae  = float(np.mean(np.abs(diffs)))
        corr = float(np.corrcoef(oco2_vals, gosat2_vals)[0, 1]) if len(oco2_vals) > 1 else 0.0
        avg_dist = float(np.mean(distances))

        # Scatter Plot data (limit to 1500 points)
        n_scatter = min(1500, len(oco2_vals))
        idx = np.random.choice(len(oco2_vals), n_scatter, replace=False) if len(oco2_vals) > n_scatter else np.arange(len(oco2_vals))
        scatter_data = [
            {"x": round(float(oco2_vals[i]), 3), "y": round(float(gosat2_vals[i]), 3)}
            for i in idx
        ]

        # Histogram
        hist_counts, bin_edges = np.histogram(diffs, bins=30)
        bias_hist = {
            "labels": [round(float(b), 3) for b in bin_edges[:-1]],
            "counts": [int(c) for c in hist_counts],
        }

        # Bias by distance
        dist_bins = [0, 10, 20, 30, 40, 50]
        dist_labels = ['0-10 km', '10-20 km', '20-30 km', '30-40 km', '40-50 km']
        dist_bias, dist_count = [], []
        for lo, hi in zip(dist_bins[:-1], dist_bins[1:]):
            mask = (distances >= lo) & (distances < hi)
            dist_bias.append(round(float(np.mean(diffs[mask])), 4) if mask.sum() > 0 else 0)
            dist_count.append(int(mask.sum()))
        
        dist_analysis = {
            "labels": dist_labels,
            "bias":   dist_bias,
            "count":  dist_count,
        }

        # Bias by month
        monthly_map = {}
        for r in rows:
            t = r['oco2_measurement__measurement_time']
            if t:
                key = t.strftime('%Y-%m') if hasattr(t, 'strftime') else str(t)[:7]
                monthly_map.setdefault(key, []).append(r['xco2_difference_ppm'])
        monthly_labels = sorted(monthly_map.keys())
        bias_monthly = {
            "labels": monthly_labels,
            "bias":   [round(float(np.mean(monthly_map[k])), 4) for k in monthly_labels],
            "count":  [len(monthly_map[k]) for k in monthly_labels],
        }

        return Response({
            "total_pairs": count,
            "bias": round(bias, 4),
            "rmse": round(rmse, 4),
            "std": round(std, 4),
            "mae": round(mae, 4),
            "corr": round(corr, 4),
            "avg_dist": round(avg_dist, 2),
            "outlier_pct": round(float(np.sum(np.abs(diffs) > 3 * std) / len(diffs) * 100), 1) if std > 0 else 0,
            "scatter_data": scatter_data,
            "bias_hist": bias_hist,
            "dist_analysis": dist_analysis,
            "bias_monthly": bias_monthly,
        })

class AnalysisJobViewSet(viewsets.ModelViewSet):
    """
    API ViewSet quản lý các công việc phân tích của người dùng.
    Người dùng chỉ nhìn thấy và quản lý các công việc do chính mình tạo ra.
    """
    queryset = AnalysisJob.objects.all()
    serializer_class = AnalysisJobSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardLimitOffsetPagination
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

class DashboardViewSet(viewsets.ViewSet):
    """
    API ViewSet để lấy dữ liệu tổng quan cho Dashboard.
    """
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        base_qs = Measurement.objects.filter(deleted_at__isnull=True)
        agg = base_qs.aggregate(
            total=Count('id'),
            avg_xco2=Avg('xco2_ppm'),
            max_xco2=Max('xco2_ppm'),
            min_xco2=Min('xco2_ppm'),
        )
        
        # Tỷ lệ % điểm đo chất lượng tốt
        total_count = agg['total'] or 0
        good_count = base_qs.filter(xco2_quality_flag=0).count()
        good_pct = round(good_count / total_count * 100, 1) if total_count else 0

        stats = {
            "measurements_total": total_count,
            "sources_total":      MeasurementSource.objects.count(),
            "locations_total":    MonitoringLocation.objects.count(),
            "comparisons_total":  DataComparison.objects.count(),
            "jobs_total":         AnalysisJob.objects.count(),
            "jobs_running":       AnalysisJob.objects.filter(
                status__in=[JobStatus.PENDING, JobStatus.RUNNING]
            ).count(),
            "avg_xco2":           round(agg['avg_xco2'], 2) if agg['avg_xco2'] else 0,
            "max_xco2":           round(agg['max_xco2'], 2) if agg['max_xco2'] else 0,
            "min_xco2":           round(agg['min_xco2'], 2) if agg['min_xco2'] else 0,
            "good_quality_pct":   good_pct,
        }

        # Phân bố theo nguồn
        by_source = list(
            base_qs.values('data_source')
            .annotate(count=Count('id'), avg=Avg('xco2_ppm'))
            .order_by('data_source')
        )
        by_source_data = [
            {
                "label": s['data_source'],
                "count": s['count'],
                "avg":   round(s['avg'], 2) if s['avg'] else 0,
            }
            for s in by_source
        ]

        # Xu hướng XCO2 theo tháng
        monthly = list(
            base_qs.filter(xco2_quality_flag=0)
            .annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), cnt=Count('id'))
            .order_by('month')
        )
        monthly_trend_data = [
            {
                "month":  m['month'].strftime('%Y-%m') if m['month'] else '',
                "source": m['data_source'],
                "avg":    round(m['avg_xco2'], 3) if m['avg_xco2'] else 0,
                "count":  m['cnt'],
            }
            for m in monthly
        ]

        # Trạng thái Jobs
        jobs_by_status = list(
            AnalysisJob.objects.values('status')
            .annotate(count=Count('id'))
        )
        jobs_by_status_data = [
            {"status": j['status'], "count": j['count']}
            for j in jobs_by_status
        ]

        # Danh sách gần đây
        recent_sources = MeasurementSourceSerializer(MeasurementSource.objects.order_by("-id")[:5], many=True).data
        recent_jobs = AnalysisJobSerializer(AnalysisJob.objects.order_by("-id")[:5], many=True).data

        return Response({
            "stats": stats,
            "by_source": by_source_data,
            "monthly_trend": monthly_trend_data,
            "jobs_by_status": jobs_by_status_data,
            "recent_sources": recent_sources,
            "recent_jobs": recent_jobs,
        })

class StatisticsViewSet(viewsets.ViewSet):
    """
    API ViewSet để lấy dữ liệu thống kê chuyên sâu về XCO2.
    """
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        # Bộ lọc tùy chọn từ URL params
        src_filter   = request.query_params.get('source', '')   # OCO2 / GOSAT2 / ''
        year_filter  = request.query_params.get('year', '')     # YYYY
        quality_only = request.query_params.get('quality', '1') == '1'  # default: chỉ data tốt

        qs = Measurement.objects.filter(deleted_at__isnull=True)
        if quality_only:
            qs = qs.filter(xco2_quality_flag=0)
        if src_filter:
            qs = qs.filter(data_source=src_filter)
        if year_filter:
            qs = qs.filter(measurement_time__year=year_filter)

        total = qs.count()

        if total == 0:
            return Response({"no_data": True, "total_filtered": 0})

        # Thống kê mô tả
        agg = qs.aggregate(
            avg=Avg('xco2_ppm'),
            minimum=Min('xco2_ppm'),
            maximum=Max('xco2_ppm'),
            std=StdDev('xco2_ppm'),
        )
        desc_stats = {
            "avg":  round(agg['avg'],     3) if agg['avg']     else 0,
            "min":  round(agg['minimum'], 3) if agg['minimum'] else 0,
            "max":  round(agg['maximum'], 3) if agg['maximum'] else 0,
            "std":  round(agg['std'],     3) if agg['std']     else 0,
        }

        # Xu hướng theo tháng, phân tách theo nguồn
        monthly = list(
            qs.annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), count=Count('id'))
            .order_by('month')
        )
        month_set = sorted({m['month'].strftime('%Y-%m') for m in monthly if m['month']})
        oco2_monthly  = {m['month'].strftime('%Y-%m'): round(m['avg_xco2'], 3)
                         for m in monthly if m['data_source'] == 'OCO2' and m['month']}
        gosat2_monthly = {m['month'].strftime('%Y-%m'): round(m['avg_xco2'], 3)
                          for m in monthly if m['data_source'] == 'GOSAT2' and m['month']}
        
        monthly_trend = {
            "labels":  month_set,
            "oco2":   [oco2_monthly.get(m)   for m in month_set],
            "gosat2": [gosat2_monthly.get(m) for m in month_set],
        }

        # Phân bố theo nguồn (summary)
        by_source = list(
            qs.values('data_source')
            .annotate(
                count=Count('id'),
                avg=Avg('xco2_ppm'),
                minimum=Min('xco2_ppm'),
                maximum=Max('xco2_ppm'),
                std=StdDev('xco2_ppm'),
            )
        )
        by_source_data = [
            {
                "source":  s['data_source'],
                "count":   s['count'],
                "avg":     round(s['avg'],     3) if s['avg']     else 0,
                "min":     round(s['minimum'], 3) if s['minimum'] else 0,
                "max":     round(s['maximum'], 3) if s['maximum'] else 0,
                "std":     round(s['std'],     3) if s['std']     else 0,
            }
            for s in by_source
        ]

        # Phân tích chất lượng dữ liệu
        total_all = Measurement.objects.filter(
            deleted_at__isnull=True,
            **({'data_source': src_filter} if src_filter else {}),
        ).count()
        good = Measurement.objects.filter(
            deleted_at__isnull=True, xco2_quality_flag=0,
            **({'data_source': src_filter} if src_filter else {}),
        ).count()
        
        quality_stats = {
            "total":    total_all,
            "good":     good,
            "bad":      total_all - good,
            "good_pct": round(good / total_all * 100, 1) if total_all else 0,
        }

        # Top tháng có XCO2 trung bình cao nhất
        top_months = list(
            qs.annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), count=Count('id'))
            .order_by('-avg_xco2')[:10]
        )
        top_months_data = [
            {
                "month":  m['month'].strftime('%Y-%m') if m['month'] else '',
                "source": m['data_source'],
                "avg":    round(m['avg_xco2'], 3) if m['avg_xco2'] else 0,
                "count":  m['count'],
            }
            for m in top_months
        ]

        # Danh sách năm để dropdown bộ lọc
        years = list(
            Measurement.objects.filter(deleted_at__isnull=True)
            .annotate(yr=TruncYear('measurement_time'))
            .values_list('yr', flat=True)
            .distinct()
            .order_by('-yr')
        )
        available_years = sorted(list(set([y.year if hasattr(y, 'year') else y for y in years if y])), reverse=True)

        # --- Báo cáo 3: Phân bố Không gian ---
        # 1. Theo dải vĩ độ
        lat_bands = qs.annotate(
            band=Case(
                When(latitude__gte=60, then=Value('Bắc Cực (60°N-90°N)')),
                When(latitude__gte=30, latitude__lt=60, then=Value('Ôn đới Bắc (30°N-60°N)')),
                When(latitude__gte=-30, latitude__lt=30, then=Value('Nhiệt đới (30°S-30°N)')),
                When(latitude__gte=-60, latitude__lt=-30, then=Value('Ôn đới Nam (60°S-30°S)')),
                When(latitude__lt=-60, then=Value('Nam Cực (90°S-60°S)')),
                output_field=CharField()
            )
        ).values('band').annotate(
            count=Count('id'),
            avg_xco2=Avg('xco2_ppm'),
            max_xco2=Max('xco2_ppm')
        ).order_by('-count')

        lat_band_stats = [
            {
                "band": b['band'],
                "count": b['count'],
                "avg": round(b['avg_xco2'], 3) if b['avg_xco2'] else 0,
                "max": round(b['max_xco2'], 3) if b['max_xco2'] else 0
            } for b in lat_bands if b['band']
        ]

        # 2. Tỷ lệ đất/biển
        land_sea = qs.filter(land_fraction__isnull=False).annotate(
            surface=Case(
                When(land_fraction__gte=0.8, then=Value('Đất liền')),
                When(land_fraction__lt=0.2, then=Value('Đại dương')),
                default=Value('Hỗn hợp'),
                output_field=CharField()
            )
        ).values('surface').annotate(
            count=Count('id'),
            avg_xco2=Avg('xco2_ppm')
        ).order_by('-count')

        land_sea_stats = [
            {
                "surface": s['surface'],
                "count": s['count'],
                "avg": round(s['avg_xco2'], 3) if s['avg_xco2'] else 0
            } for s in land_sea if s['surface']
        ]

        # 3. Hotspots
        top_hotspots = list(
            qs.values('latitude', 'longitude', 'xco2_ppm', 'measurement_time', 'data_source')
            .order_by('-xco2_ppm')[:10]
        )
        for h in top_hotspots:
            h['xco2_ppm'] = round(h['xco2_ppm'], 3)

        # --- Báo cáo 5: Kiểm soát chất lượng chi tiết ---
        quality_detail = {
            "cloudy": qs.filter(cloud_flag=1).count(),
            "high_zenith": qs.filter(solar_zenith_angle_deg__gte=70).count(),
            "high_uncertainty": qs.filter(xco2_uncertainty_ppm__gte=2.0).count()
        }

        # --- Báo cáo 6: Phân tích theo năm ---
        annual_summary_qs = qs.annotate(yr=TruncYear('measurement_time')).values('yr').annotate(
            count=Count('id'),
            avg_xco2=Avg('xco2_ppm'),
            min_xco2=Min('xco2_ppm'),
            max_xco2=Max('xco2_ppm'),
            std_xco2=StdDev('xco2_ppm')
        ).order_by('-yr')
        
        annual_summary = [
            {
                "year": a['yr'].year if a['yr'] else 'N/A',
                "count": a['count'],
                "avg": round(a['avg_xco2'], 3) if a['avg_xco2'] else 0,
                "min": round(a['min_xco2'], 3) if a['min_xco2'] else 0,
                "max": round(a['max_xco2'], 3) if a['max_xco2'] else 0,
                "std": round(a['std_xco2'], 3) if a['std_xco2'] else 0
            } for a in annual_summary_qs if a['yr']
        ]

        # --- Báo cáo 7: Phân bố thống kê ---
        sample_qs = qs
        if total > 50000:
            sample_qs = qs.order_by('?')[:20000]
        
        vals = list(sample_qs.values_list('xco2_ppm', 'data_source'))
        histogram = {"oco2": {"labels": [], "counts": []}, "gosat2": {"labels": [], "counts": []}}
        percentiles = {}
        
        if vals:
            oco2_vals = [v[0] for v in vals if v[1] == 'OCO2']
            gosat2_vals = [v[0] for v in vals if v[1] == 'GOSAT2']
            all_vals = [v[0] for v in vals]
            
            if oco2_vals:
                hist, bins = np.histogram(oco2_vals, bins=40, range=(390, 430))
                histogram["oco2"]["labels"] = [round(float(b), 1) for b in bins[:-1]]
                histogram["oco2"]["counts"] = [int(c) for c in hist]
            if gosat2_vals:
                hist, bins = np.histogram(gosat2_vals, bins=40, range=(390, 430))
                histogram["gosat2"]["labels"] = [round(float(b), 1) for b in bins[:-1]]
                histogram["gosat2"]["counts"] = [int(c) for c in hist]

            if all_vals:
                p_vals = np.percentile(all_vals, [5, 25, 50, 75, 95])
                percentiles = {
                    "p5": round(float(p_vals[0]), 2),
                    "p25": round(float(p_vals[1]), 2),
                    "p50": round(float(p_vals[2]), 2),
                    "p75": round(float(p_vals[3]), 2),
                    "p95": round(float(p_vals[4]), 2),
                }

        return Response({
            "total_filtered": total,
            "desc_stats": desc_stats,
            "monthly_trend": monthly_trend,
            "by_source": by_source_data,
            "quality_stats": quality_stats,
            "top_months": top_months_data,
            "available_years": available_years,
            "spatial_stats": {
                "lat_bands": lat_band_stats,
                "land_sea": land_sea_stats,
                "hotspots": top_hotspots
            },
            "quality_detail": quality_detail,
            "annual_summary": annual_summary,
            "distribution": {
                "histogram": histogram,
                "percentiles": percentiles
            }
        })


class StationViewSet(viewsets.ModelViewSet):
    """
    API ViewSet quản lý các trạm quan trắc chất lượng không khí (`aq-stations`).
    Hỗ trợ các thao tác CRUD chuẩn, lọc nâng cao, xuất GeoJSON bản đồ,
    dữ liệu đo đạc theo trạm và thống kê theo trạm.
    """
    queryset = Station.objects.all()
    serializer_class = StationSerializer
    pagination_class = StandardLimitOffsetPagination
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = Station.objects.annotate(
            measurement_count=Count('measurements'),
            latest_measurement_at=Max('measurements__measured_at')
        )
        return filter_stations(qs, self.request.query_params) # type: ignore

    @action(detail=False, methods=['get'])
    def map(self, request):
        """
        [GET] /api/v1/aq-stations/map/
        Trả về danh sách trạm dưới định dạng GeoJSON FeatureCollection sử dụng GeoFeatureModelSerializer.
        """
        qs = self.get_queryset().filter(geom__isnull=False)
        serializer = StationGeoSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def measurements(self, request, pk=None):
        """
        [GET] /api/v1/aq-stations/{id}/measurements/
        Trả về danh sách dữ liệu đo đạc theo trạm cụ thể.
        """
        station = self.get_object()
        ms_qs = StationMeasurement.objects.filter(station=station)

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if date_from:
            ms_qs = ms_qs.filter(measured_at__gte=date_from)
        if date_to:
            ms_qs = ms_qs.filter(measured_at__lte=date_to)

        ordering = request.query_params.get('ordering', '-measured_at')
        ms_qs = ms_qs.order_by(ordering)

        page = self.paginate_queryset(ms_qs)
        if page is not None:
            serializer = StationMeasurementSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = StationMeasurementSerializer(ms_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        [GET] /api/v1/aq-stations/{id}/stats/
        Xem thống kê các chỉ số ô nhiễm (Min, Max, Avg, Count) của trạm cụ thể.
        """
        station = self.get_object()
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        stats_data = get_station_stats(station.id, date_from, date_to)
        return Response(stats_data)

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """
        [POST] /api/v1/aq-stations/import_csv/
        Tải lên file CSV chứa danh mục các trạm quan trắc không khí để nhập vào hệ thống.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'success': False, 'error': 'Vui lòng đính kèm tệp tin CSV với key field là "file".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = import_stations_from_csv(file_obj)
        if not result.get('success', True):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """
        [GET] /api/v1/aq-stations/download_template/
        Tải xuống file CSV mẫu cấu trúc nhập danh mục trạm quan trắc.
        """
        csv_content = generate_station_csv_template()
        response = HttpResponse(csv_content, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="mau_import_tram_quan_trac.csv"'
        return response

    @action(detail=False, methods=['get'])
    def download_measurement_template(self, request):
        """
        [GET] /api/v1/aq-stations/download_measurement_template/
        Tải xuống file CSV mẫu cấu trúc nhập dữ liệu đo đạc chất lượng không khí của trạm.
        """
        csv_content = generate_measurement_csv_template()
        response = HttpResponse(csv_content, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="mau_import_do_dac_tram.csv"'
        return response

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_measurements(self, request, pk=None):
        """
        [POST] /api/v1/aq-stations/{id}/import_measurements/
        Tải lên file CSV chứa dữ liệu đo đạc cho trạm cụ thể này.
        """
        station = self.get_object()
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'success': False, 'error': 'Vui lòng đính kèm tệp tin CSV với key field là "file".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = import_station_measurements_csv(station, file_obj)

        if not result.get('success', True):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)



class StationMeasurementViewSet(viewsets.ModelViewSet):
    """
    API ViewSet quản lý chuỗi dữ liệu đo đạc chất lượng không khí của trạm (`aq-measurements`).
    Hỗ trợ truy vấn phân trang, lọc nâng cao, lấy phép đo mới nhất từng trạm,
    xuất tệp CSV, tải tệp CSV mẫu và import tệp CSV đo đạc theo trạm.
    """
    queryset = StationMeasurement.objects.all()
    serializer_class = StationMeasurementSerializer
    pagination_class = StandardLimitOffsetPagination
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = StationMeasurement.objects.select_related('station')
        return filter_measurements(qs, self.request.query_params)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """
        [GET] /api/v1/aq-measurements/latest/
        Trả về danh sách phép đo mới nhất của mỗi trạm.
        """
        qs = get_latest_measurements_per_station()
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """
        [GET] /api/v1/aq-measurements/export/
        Xuất danh sách dữ liệu đo đạc theo các điều kiện lọc hiện tại ra tệp CSV.
        """
        qs = self.get_queryset()
        csv_data = export_measurements_csv(qs)
        response = HttpResponse(csv_data, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="du_lieu_do_dac_tram.csv"'
        return response

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """
        [GET] /api/v1/aq-measurements/download_template/
        Tải xuống file CSV mẫu cấu trúc nhập dữ liệu đo đạc chất lượng không khí theo trạm.
        """
        csv_content = generate_measurement_csv_template()
        response = HttpResponse(csv_content, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="mau_import_do_dac_tram.csv"'
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """
        [POST] /api/v1/aq-measurements/import_csv/
        Tải lên file CSV tổng hợp chứa dữ liệu đo đạc để nạp vào cơ sở dữ liệu.
        Tự động nhận diện trạm của từng dòng theo stationId/stationCode.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'success': False, 'error': 'Vui lòng đính kèm tệp tin CSV với key field là "file".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = import_measurements_bulk_csv(file_obj)

        if not result.get('success', True):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)





