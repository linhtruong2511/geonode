import csv
import io
from django.db import transaction
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
        has_measurements = StationMeasurement.objects.filter(station_id=OuterRef('pk'))
        if has_data_bool:
            queryset = queryset.filter(Exists(has_measurements))
        else:
            queryset = queryset.filter(~Exists(has_measurements))

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


def import_stations_from_csv(file_obj):
    """
    Import hoặc cập nhật danh sách trạm quan trắc từ tệp tin CSV theo đúng định dạng mẫu.
    Kiểm tra nghiêm ngặt cấu trúc header của file CSV.
    """
    if hasattr(file_obj, 'read'):
        content = file_obj.read()
        if isinstance(content, bytes):
            try:
                decoded = content.decode('utf-8-sig')
            except UnicodeDecodeError:
                try:
                    decoded = content.decode('utf-8')
                except UnicodeDecodeError:
                    decoded = content.decode('latin-1')
            stream = io.StringIO(decoded)
        else:
            stream = io.StringIO(content)
    else:
        stream = file_obj

    reader = csv.DictReader(stream)

    # 1. Kiểm tra header của file CSV
    if not reader.fieldnames:
        return {
            'success': False,
            'error': 'Tệp tin CSV rỗng hoặc không chứa dòng tiêu đề (header).'
        }

    actual_fieldnames = [field.strip() for field in reader.fieldnames if field]
    actual_fieldnames_lower = [f.lower() for f in actual_fieldnames]

    # Các cột bắt buộc theo mẫu
    required_cols = ['stationId', 'stationName']
    missing_cols = []
    for col in required_cols:
        if col.lower() not in actual_fieldnames_lower:
            missing_cols.append(col)

    if missing_cols:
        return {
            'success': False,
            'error': f'File CSV không đúng định dạng mẫu. Thiếu các cột bắt buộc: {", ".join(missing_cols)}. Các cột chuẩn gồm: stationId, stationCode, stationName, address, latitude, longitude, status.'
        }

    total_rows = 0
    created_count = 0
    updated_count = 0
    error_count = 0
    errors = []

    rows_to_process = []
    for idx, row in enumerate(reader, start=1):
        total_rows += 1
        st_id = (row.get('stationId') or row.get('station_id') or row.get('id') or '').strip()
        st_code = (row.get('stationCode') or row.get('station_code') or row.get('code') or '').strip()
        st_name = (row.get('stationName') or row.get('station_name') or row.get('name') or '').strip()
        address = (row.get('address') or '').strip() or None

        lat_str = (row.get('latitude') or row.get('lat') or '').strip()
        lon_str = (row.get('longitude') or row.get('longtitude') or row.get('lon') or row.get('lng') or '').strip()
        status_str = (row.get('status') or '').strip()

        if not st_id:
            errors.append(f"Dòng {idx}: Thiếu stationId")
            error_count += 1
            continue

        if not st_name:
            errors.append(f"Dòng {idx}: Thiếu stationName")
            error_count += 1
            continue

        lat_val = None
        if lat_str:
            try:
                lat_val = float(lat_str)
            except ValueError:
                errors.append(f"Dòng {idx}: Giá trị vĩ độ (latitude) '{lat_str}' không hợp lệ")
                error_count += 1
                continue

        lon_val = None
        if lon_str:
            try:
                lon_val = float(lon_str)
            except ValueError:
                errors.append(f"Dòng {idx}: Giá trị kinh độ (longitude) '{lon_str}' không hợp lệ")
                error_count += 1
                continue

        status_val = 0
        if status_str:
            try:
                status_val = int(status_str)
            except ValueError:
                errors.append(f"Dòng {idx}: Trạng thái (status) '{status_str}' không phải định dạng số hợp lệ")
                error_count += 1
                continue

        rows_to_process.append({
            'id': st_id,
            'code': st_code or None,
            'name': st_name,
            'address': address,
            'latitude': lat_val,
            'longitude': lon_val,
            'status': status_val,
        })

    if total_rows == 0:
        return {
            'success': False,
            'error': 'File CSV không có dữ liệu bản ghi nào.'
        }

    with transaction.atomic():
        for item in rows_to_process:
            defaults = {
                'code': item['code'],
                'name': item['name'],
                'address': item['address'],
                'latitude': item['latitude'],
                'longitude': item['longitude'],
                'status': item['status'],
            }

            station, created = Station.objects.update_or_create(
                id=item['id'],
                defaults=defaults
            )
            # save() tự động sinh geom từ lat/lon
            station.save()

            if created:
                created_count += 1
            else:
                updated_count += 1

    return {
        'success': True,
        'total_rows': total_rows,
        'created_count': created_count,
        'updated_count': updated_count,
        'error_count': error_count,
        'errors': errors[:20]
    }



def generate_station_csv_template():
    """
    Tạo nội dung file CSV mẫu hỗ trợ import danh mục trạm quan trắc.
    Bao gồm UTF-8 BOM để Excel hiển thị đúng tiếng Việt.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['stationId', 'stationCode', 'stationName', 'address', 'latitude', 'longitude', 'status'])
    writer.writerow([
        '28505268571336961948594948504', 'PT_VTRI_KHIVTR',
        'Phú Thọ: đường Hùng Vương - Tp Việt Trì (KK)',
        'Khuôn viên của Công ty xăng dầu Phú Thọ tại đường Hùng Vương, thành phố Việt Trì',
        '21.3385', '105.367', '0'
    ])
    writer.writerow([
        '28505272740301122608933325208', 'LEDU_KHIDNA',
        'Đà Nẵng: 41 đường Lê Duẩn (KK)',
        'Khuôn viên của Trường Đại học Đà Nẵng, số 41 – Lê Duẩn',
        '16.074', '108.215', '0'
    ])
    writer.writerow([
        '28915732959631398237539556920', 'LANG_KHILAN',
        'Hà Nội: Khu vực Lăng Bác (KK)',
        'Khu vực Lăng Bác, Ba Đình, Hà Nội',
        '21.0356', '105.833', '0'
    ])

    csv_data = output.getvalue()
    return '\ufeff' + csv_data

