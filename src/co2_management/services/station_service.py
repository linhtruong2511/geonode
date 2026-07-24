from django.db.models import Q, Count, Max, Min, Avg
from django.utils.dateparse import parse_datetime
from ..models import Station, StationMeasurement

POLLUTANT_FIELDS = [
    'pm_1', 'pm_2_5', 'pm_10', 'tsp',
    'co', 'no', 'no2', 'nox', 'so2', 'o3'
]


def filter_stations(queryset, params):
    """
    Lọc danh sách trạm quan trắc theo các tham số truy vấn từ request.
    - search: tìm theo tên, mã trạm, hoặc ID
    - status: lọc theo trạng thái hoạt động (int)
    - has_data: True/False (chỉ lấy các trạm có dữ liệu đo đạc)
    - bbox: min_lon,min_lat,max_lon,max_lat
    """
    search = params.get('search')
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) |
            Q(code__icontains=search) |
            Q(id__icontains=search)
        )

    status_val = params.get('status')
    if status_val is not None and status_val != '':
        try:
            queryset = queryset.filter(status=int(status_val))
        except ValueError:
            pass

    has_data = params.get('has_data')
    if has_data is not None:
        has_data_bool = str(has_data).lower() in ['true', '1']
        if has_data_bool:
            queryset = queryset.filter(measurements__isnull=False).distinct()
        else:
            queryset = queryset.filter(measurements__isnull=True).distinct()

    bbox = params.get('bbox')
    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(',')]
            if len(parts) == 4:
                min_lon, min_lat, max_lon, max_lat = parts
                queryset = queryset.filter(
                    longitude__gte=min_lon,
                    longitude__lte=max_lon,
                    latitude__gte=min_lat,
                    latitude__lte=max_lat
                )
        except (ValueError, TypeError):
            pass

    return queryset


def get_available_pollutants(station):
    """
    Xác định danh sách các chỉ số ô nhiễm mà trạm đã từng đo đạc.
    """
    available = []
    qs = StationMeasurement.objects.filter(station=station)
    if not qs.exists():
        return available

    for field in POLLUTANT_FIELDS:
        kwargs = {f"{field}__isnull": False}
        if qs.filter(**kwargs).exists():
            available.append(field)
    return available


def get_station_stats(station_id, date_from=None, date_to=None):
    """
    Thống kê tổng hợp (Min, Max, Avg, Count) các chỉ số ô nhiễm của một trạm.
    """
    qs = StationMeasurement.objects.filter(station_id=station_id)

    if date_from:
        dt_from = parse_datetime(date_from)
        if dt_from:
            qs = qs.filter(measured_at__gte=dt_from)

    if date_to:
        dt_to = parse_datetime(date_to)
        if dt_to:
            qs = qs.filter(measured_at__lte=dt_to)

    total_records = qs.count()
    if total_records == 0:
        return {
            'station_id': station_id,
            'total_records': 0,
            'pollutants': {}
        }

    agg_kwargs = {}
    for field in POLLUTANT_FIELDS:
        agg_kwargs[f"{field}_avg"] = Avg(field)
        agg_kwargs[f"{field}_min"] = Min(field)
        agg_kwargs[f"{field}_max"] = Max(field)
        agg_kwargs[f"{field}_count"] = Count(field)

    aggregated = qs.aggregate(**agg_kwargs)

    pollutants_result = {}
    for field in POLLUTANT_FIELDS:
        cnt = aggregated.get(f"{field}_count", 0)
        if cnt > 0:
            pollutants_result[field] = {
                'avg': round(aggregated[f"{field}_avg"], 4) if aggregated[f"{field}_avg"] is not None else None,
                'min': round(aggregated[f"{field}_min"], 4) if aggregated[f"{field}_min"] is not None else None,
                'max': round(aggregated[f"{field}_max"], 4) if aggregated[f"{field}_max"] is not None else None,
                'count': cnt
            }

    return {
        'station_id': station_id,
        'total_records': total_records,
        'pollutants': pollutants_result
    }


def get_stations_geojson(queryset):
    """
    Chuyển đổi danh sách trạm sang cấu trúc GeoJSON FeatureCollection cho bản đồ.
    Kèm theo dữ liệu đo đạc gần nhất của từng trạm nếu có.
    """
    features = []
    for station in queryset:
        if station.longitude is None or station.latitude is None:
            continue

        latest_meas = StationMeasurement.objects.filter(station=station).order_by('-measured_at').first()

        properties = {
            'id': station.id,
            'code': station.code,
            'name': station.name,
            'address': station.address,
            'status': station.status,
            'created_at': station.created_at.isoformat() if station.created_at else None,
            'latest_measured_at': latest_meas.measured_at.isoformat() if latest_meas else None,
            'latest_pm_2_5': float(latest_meas.pm_2_5) if latest_meas and latest_meas.pm_2_5 is not None else None,
            'latest_pm_10': float(latest_meas.pm_10) if latest_meas and latest_meas.pm_10 is not None else None,
            'latest_co': float(latest_meas.co) if latest_meas and latest_meas.co is not None else None,
            'latest_no2': float(latest_meas.no2) if latest_meas and latest_meas.no2 is not None else None,
            'latest_so2': float(latest_meas.so2) if latest_meas and latest_meas.so2 is not None else None,
            'latest_o3': float(latest_meas.o3) if latest_meas and latest_meas.o3 is not None else None,
        }

        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(station.longitude), float(station.latitude)]
            },
            'properties': properties
        }
        features.append(feature)

    return {
        'type': 'FeatureCollection',
        'features': features
    }
