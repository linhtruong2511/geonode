from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import D
from django_filters import rest_framework as filters
from rest_framework_gis.filters import InBBoxFilter
from rest_framework.pagination import PageNumberPagination

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000

from .models import (
    Dataset,
    Station,
    Observation,
    MeteorologicalEvent,
    RasterGranuleIndex,
)
from .serializers import (
    DatasetSerializer,
    StationSerializer,
    ObservationSerializer,
    MeteorologicalEventSerializer,
    RasterGranuleIndexSerializer,
)


class ObservationFilter(filters.FilterSet):
    start_time = filters.DateTimeFilter(field_name="obs_time", lookup_expr="gte")
    end_time = filters.DateTimeFilter(field_name="obs_time", lookup_expr="lte")

    class Meta:
        model = Observation
        fields = ["station", "start_time", "end_time"]


class DatasetViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API cho Nhóm A1: Bản đồ dữ liệu lưới (Lấy danh mục dữ liệu lưới để hiển thị lên bản đồ).
    Và hỗ trợ A4 (So sánh lớp) bằng cách lấy danh sách các layers.
    """

    queryset = Dataset.objects.filter(is_active=True)
    serializer_class = DatasetSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["category"]

    @action(detail=True, methods=["get"])
    def time_steps(self, request, pk=None):
        """
        API cho Nhóm A6: Time slider (Lấy danh sách các mốc thời gian có dữ liệu của 1 dataset).
        """
        dataset = self.get_object()
        granules = (
            RasterGranuleIndex.objects.filter(dataset=dataset)
            .order_by("granule_time")
            .values_list("granule_time", flat=True)
            .distinct()
        )
        return Response({"time_steps": list(granules)})


class StationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API cho Nhóm A2: Lớp trạm quan trắc (Hiển thị trạm trên bản đồ dưới dạng GeoJSON).

    Hỗ trợ B2: Truy vấn không gian (Lấy trạm theo Bounding Box).
    """

    queryset = Station.objects.filter(is_active=True)
    serializer_class = StationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    bbox_filter_field = "geom"
    filter_backends = [filters.DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ["station_type", "dataset__code"]

    @action(detail=False, methods=["get"])
    def spatial_query(self, request):
        """
        API mở rộng cho Nhóm B2: Truy vấn không gian theo Điểm và Bán kính.
        Tham số: lat, lon, radius_km
        """
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        radius_km = request.query_params.get("radius_km", 10)

        if lat and lon:
            point = Point(float(lon), float(lat), srid=4326)
            stations = self.queryset.filter(
                geom__distance_lte=(point, D(km=float(radius_km)))
            )
            page = self.paginate_queryset(stations)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)

            serializer = self.get_serializer(stations, many=True)
            return Response(serializer.data)
        return Response({"error": "Missing lat or lon parameters"}, status=400)


class ObservationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API cho Nhóm A5: Biểu đồ chuỗi thời gian (Lấy chuỗi dữ liệu đo đạc theo thời gian).

    Và Nhóm B1: Truy vấn trạm + thời gian (Lọc observation theo trạm và khoảng thời gian).
    """

    queryset = Observation.objects.all().order_by("obs_time")
    serializer_class = ObservationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = ObservationFilter


class MeteorologicalEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API cho Nhóm A3: Đường đi bão/KKL (Hiển thị quỹ đạo và vùng ảnh hưởng của sự kiện).
    """

    queryset = MeteorologicalEvent.objects.all()
    serializer_class = MeteorologicalEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["event_type"]

    @action(detail=True, methods=["get"])
    def impacted_observations(self, request, pk=None):
        """
        API cho Nhóm B3: Truy vấn theo sự kiện (Lấy dữ liệu trạm quan trắc nằm trong vùng ảnh hưởng và khoảng thời gian của bão/KKL).
        """
        event = self.get_object()
        if not event.influence_area or not event.start_date:
            return Response(
                {"error": "Event lacks spatial or temporal data"}, status=400
            )

        end_date = event.end_date or getattr(event.tracks.last(), "track_time", None)

        # 1. Tìm các trạm nằm trong vùng ảnh hưởng
        impacted_stations = Station.objects.filter(
            geom__intersects=event.influence_area
        )

        # 2. Lấy dữ liệu quan trắc của các trạm đó trong thời gian sự kiện diễn ra
        obs_qs = Observation.objects.filter(
            station__in=impacted_stations, obs_time__gte=event.start_date
        )
        if end_date:
            obs_qs = obs_qs.filter(obs_time__lte=end_date)
            
        page = self.paginate_queryset(obs_qs)
        if page is not None:
            serializer = ObservationSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ObservationSerializer(obs_qs, many=True)
        return Response(serializer.data)


class RasterGranuleIndexViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API hỗ trợ Nhóm B4: Giá trị lưới tại điểm (Tìm metadata của lưới tại một điểm cụ thể).

    Lưu ý: Để lấy được GIÁ TRỊ thực tế từ file NetCDF/Raster, cần giao tiếp với GeoServer WCS hoặc dùng thư viện phân tích Raster riêng (rasterio). API này chỉ trả về metadata file chứa dữ liệu.
    """

    queryset = RasterGranuleIndex.objects.all()
    serializer_class = RasterGranuleIndexSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    bbox_filter_field = "footprint"
    filter_backends = [filters.DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ["dataset", "variable_code"]

    @action(detail=False, methods=["get"])
    def point_metadata(self, request):
        """
        API cho Nhóm B4: Truy vấn metadata của raster tại tọa độ (lat, lon) và thời gian cụ thể.
        """
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        time = request.query_params.get("time")
        dataset_code = request.query_params.get("dataset_code")

        if not all([lat, lon, time, dataset_code]):
            return Response(
                {"error": "Missing lat, lon, time or dataset_code"}, status=400
            )

        point = Point(float(lon), float(lat), srid=4326)

        granules = self.queryset.filter(
            dataset__code=dataset_code, footprint__intersects=point, granule_time=time
        )
        
        page = self.paginate_queryset(granules)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(granules, many=True)
        return Response(serializer.data)
