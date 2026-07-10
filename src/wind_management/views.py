import datetime
import math
from django.db.models.query import QuerySet
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import D
from django_filters import rest_framework as filters
from rest_framework_gis.filters import InBBoxFilter
from rest_framework.pagination import PageNumberPagination
from django.db.models.functions import TruncMonth, TruncYear, TruncDay
from django.db.models import Avg, Max, Min, Count, Aggregate, FloatField
from .services import get_netcdf_data


class Median(Aggregate):
    function = "PERCENTILE_CONT"
    template = "%(function)s(0.5) WITHIN GROUP (ORDER BY %(expressions)s)"
    # output_field = FloatField()


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
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
    DatasetVariableSerializer,
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

    @action(detail=True, methods=["get"])
    def year_steps(self, request, pk=None):
        datasest = self.get_object()
        granules = (
            RasterGranuleIndex.objects.filter(dataset=datasest)
            .annotate(year=TruncYear("granule_time"))
            .values_list("year", flat=True)
            .distinct()
        )
        return Response({"year_steps": list(granules)})
    
    @action(detail=True, methods=["get"])
    def month_steps(self, request, pk=None):
        datasest = self.get_object()
        granules = (
            RasterGranuleIndex.objects.filter(dataset=datasest)
            .annotate(month=TruncMonth("granule_time"))
            .values_list("month", flat=True)
            .distinct()
        )
        return Response({"month_steps": list(granules)})
    
    @action(detail=True, methods=["get"])
    def day_steps(self, request, pk=None):
        datasest = self.get_object()
        granules = (
            RasterGranuleIndex.objects.filter(dataset=datasest)
            .annotate(day=TruncDay("granule_time"))
            .values_list("day", flat=True)
            .distinct()
        )
        return Response({"day_steps": list(granules)})

    @action(detail=True, methods=["get"])
    def get_variables(self, request, pk=None):
        dataset = self.get_object()
        serialser = DatasetVariableSerializer(dataset.variables.all(), many=True)
        return Response({"variables": serialser.data})

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

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data

        # Lấy bản ghi quan trắc mới nhất của trạm này
        latest_obs = instance.observations.order_by("-obs_time").first()
        latest_obs_data = None
        if latest_obs:
            latest_obs_data = ObservationSerializer(latest_obs).data

        # Vì StationSerializer sử dụng GeoFeatureModelSerializer (định dạng GeoJSON),
        # ta cần lưu thông tin này vào thuộc tính 'properties' của GeoJSON Feature
        if "properties" in data:
            data["properties"]["latest_observation"] = latest_obs_data
        else:
            data["latest_observation"] = latest_obs_data

        return Response(data)

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

    @action(detail=True, methods=["get"], url_path="monthly-summary")
    def monthly_summary(self, request, pk=None):

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # Lấy thông tin trạm hiện tại
        station = self.get_object()

        # Lọc ra danh sách đo đạc của trạm này
        observations = Observation.objects.filter(station=station)

        if start_date:
            observations = observations.filter(obs_time__gte=start_date)
        if end_date:
            observations = observations.filter(obs_time__lte=end_date)

        # Gom dữ liệu theo tháng và tính toán toàn bộ chỉ số (bao gồm Trung vị - Median)
        summary = (
            observations.annotate(month=TruncMonth("obs_time"))
            .values("month")
            .annotate(
                total_records=Count("id"),
                # 1. Nhiệt độ 2m (temp_2m)
                temp_2m_min=Min("temp_2m"),
                temp_2m_max=Max("temp_2m"),
                temp_2m_avg=Avg("temp_2m"),
                temp_2m_median=Median("temp_2m"),
                # 2. Nhiệt độ thấp nhất (temp_min)
                temp_min_min=Min("temp_min"),
                temp_min_max=Max("temp_min"),
                temp_min_avg=Avg("temp_min"),
                temp_min_median=Median("temp_min"),
                # 3. Nhiệt độ cao nhất (temp_max)
                temp_max_min=Min("temp_max"),
                temp_max_max=Max("temp_max"),
                temp_max_avg=Avg("temp_max"),
                temp_max_median=Median("temp_max"),
                # 4. Độ ẩm (humidity)
                humidity_min=Min("humidity"),
                humidity_max=Max("humidity"),
                humidity_avg=Avg("humidity"),
                humidity_median=Median("humidity"),
                # 5. Khí áp (pressure)
                pressure_min=Min("pressure"),
                pressure_max=Max("pressure"),
                pressure_avg=Avg("pressure"),
                pressure_median=Median("pressure"),
                # 6. Tốc độ gió (wind_speed)
                wind_speed_min=Min("wind_speed"),
                wind_speed_max=Max("wind_speed"),
                wind_speed_avg=Avg("wind_speed"),
                wind_speed_median=Median("wind_speed"),
                # 7. Lượng mưa 6h (rain_06h)
                rain_06h_min=Min("rain_06h"),
                rain_06h_max=Max("rain_06h"),
                rain_06h_avg=Avg("rain_06h"),
                rain_06h_median=Median("rain_06h"),
                # 8. Lượng mưa 24h (rain_24h)
                rain_24h_min=Min("rain_24h"),
                rain_24h_max=Max("rain_24h"),
                rain_24h_avg=Avg("rain_24h"),
                rain_24h_median=Median("rain_24h"),
            )
            .order_by("month")
        )

        return Response(
            {
                "station_id": station.id,
                "station_name": station.name,
                "results": summary,
            }
        )

    @action(detail=True, methods=["get"], url_path="yearly-summary")
    def yearly_summary(self, request, pk=None):
        # Lấy thông tin trạm hiện tại
        station = self.get_object()

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # Lọc ra danh sách đo đạc của trạm này
        observations = Observation.objects.filter(station=station)

        if start_date:
            observations = observations.filter(obs_time__gte=start_date)
        if end_date:
            observations = observations.filter(obs_time__lte=end_date)

        # Gom dữ liệu theo năm và tính toán toàn bộ chỉ số (bao gồm Trung vị - Median)
        summary = (
            observations.annotate(year=TruncYear("obs_time"))
            .values("year")
            .annotate(
                total_records=Count("id"),
                # 1. Nhiệt độ 2m (temp_2m)
                temp_2m_min=Min("temp_2m"),
                temp_2m_max=Max("temp_2m"),
                temp_2m_avg=Avg("temp_2m"),
                temp_2m_median=Median("temp_2m"),
                # 2. Nhiệt độ thấp nhất (temp_min)
                temp_min_min=Min("temp_min"),
                temp_min_max=Max("temp_min"),
                temp_min_avg=Avg("temp_min"),
                temp_min_median=Median("temp_min"),
                # 3. Nhiệt độ cao nhất (temp_max)
                temp_max_min=Min("temp_max"),
                temp_max_max=Max("temp_max"),
                temp_max_avg=Avg("temp_max"),
                temp_max_median=Median("temp_max"),
                # 4. Độ ẩm (humidity)
                humidity_min=Min("humidity"),
                humidity_max=Max("humidity"),
                humidity_avg=Avg("humidity"),
                humidity_median=Median("humidity"),
                # 5. Khí áp (pressure)
                pressure_min=Min("pressure"),
                pressure_max=Max("pressure"),
                pressure_avg=Avg("pressure"),
                pressure_median=Median("pressure"),
                # 6. Tốc độ gió (wind_speed)
                wind_speed_min=Min("wind_speed"),
                wind_speed_max=Max("wind_speed"),
                wind_speed_avg=Avg("wind_speed"),
                wind_speed_median=Median("wind_speed"),
                # 7. Lượng mưa 6h (rain_06h)
                rain_06h_min=Min("rain_06h"),
                rain_06h_max=Max("rain_06h"),
                rain_06h_avg=Avg("rain_06h"),
                rain_06h_median=Median("rain_06h"),
                # 8. Lượng mưa 24h (rain_24h)
                rain_24h_min=Min("rain_24h"),
                rain_24h_max=Max("rain_24h"),
                rain_24h_avg=Avg("rain_24h"),
                rain_24h_median=Median("rain_24h"),
            )
            .order_by("year")
        )

        return Response(
            {
                "station_id": station.id,
                "station_name": station.name,
                "results": summary,
            }
        )


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
    filterset_fields = ["dataset", "variable_code", "granule_time"]

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

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        API summary metrics of the RasterGranuleIndex records.
        """
        queryset = self.filter_queryset(self.get_queryset())

        # 1. Total number of granules
        total_granules = queryset.count()

        # 2. Minimum and maximum granule_time
        time_bounds = queryset.aggregate(
            min_time=Min("granule_time"), max_time=Max("granule_time")
        )
        min_granule_time = time_bounds.get("min_time")
        max_granule_time = time_bounds.get("max_time")

        # 3. Granule count grouped by dataset (dataset code, dataset name, count)
        dataset_counts = (
            queryset.values("dataset__code", "dataset__name")
            .annotate(count=Count("id"))
            .order_by("dataset__code")
        )
        datasets = [
            {
                "dataset_code": item["dataset__code"],
                "dataset_name": item["dataset__name"],
                "count": item["count"],
            }
            for item in dataset_counts
        ]

        # 4. List of unique variable codes
        unique_variable_codes = list(
            queryset.values_list("variable_code", flat=True)
            .distinct()
            .exclude(variable_code__isnull=True)
            .exclude(variable_code="")
        )

        return Response(
            {
                "total_granules": total_granules,
                "min_granule_time": min_granule_time,
                "max_granule_time": max_granule_time,
                "datasets": datasets,
                "unique_variable_codes": unique_variable_codes,
            }
        )

    @action(detail=False, methods=["get"])
    def data(self, request):
        """
        API to extract raw/sliced/downsampled NetCDF grid values for wind vector & heatmap plotting.

        Query parameters:
        - time: Time filter (string, format 'YYYY-MM-DDTHH:MM:SS')
        - dataset_id: Dataset ID
        - step: Downsampling factor (int, default=1, e.g. step=2 retrieves every 2nd grid point)
        - bbox: Bounding box coordinates (string, format 'min_lon,min_lat,max_lon,max_lat')
        - u: U component variable code
        - v: V component variable code
        """
        time = request.query_params.get("time")
        dataset_id = request.query_params.get("dataset_id")
        if time is None:
            granule = (
                RasterGranuleIndex.objects.filter(dataset_id=dataset_id)
                .order_by("-granule_time")
                .first()
            )
        else:
            granule = RasterGranuleIndex.objects.filter(granule_time__gte=time).first()

        if granule is None:
            return Response({"error": "No granules found"}, status=404)

        file_location = granule.file_location

        # Parse step
        step = request.query_params.get("step", 1)
        try:
            step = int(step)
            if step < 1:
                step = 1
        except ValueError:
            step = 1

        # Parse bbox
        bbox = None
        bbox_str = request.query_params.get("bbox")
        if bbox_str:
            try:
                bbox = [float(x) for x in bbox_str.split(",")]
                if len(bbox) != 4:
                    bbox = None
            except ValueError:
                bbox = None

        # Parse variable code override
        u = request.query_params.get("u")
        v = request.query_params.get("v")
        if u is None and v is None:
            return Response(
                {"error": "Missing both u and v variable codes. Provide at least one."}, status=400
            )
        
        valid_codes = list(granule.dataset.variables.values_list("variable_code", flat=True))
        if u and u not in valid_codes:
            return Response(
                {"error": f"Invalid u variable code: {u}"}, status=400
            )
        if v and v not in valid_codes:
            return Response(
                {"error": f"Invalid v variable code: {v}"}, status=400
            )
        try:
            data = get_netcdf_data(
                file_location, bbox=bbox, step=step, u=u, v=v
            )
            return Response(data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)
