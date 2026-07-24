import csv
import io
from django.db import transaction
from django.db.models import Q, Count, Exists, Max, Min, Avg, OuterRef
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_naive, make_aware, get_current_timezone
from ..models import Station, StationMeasurement
import logging
logger = logging.getLogger(__name__)
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


CSV_POLLUTANT_MAP = {
    'PM-1': 'pm_1',
    'PM1': 'pm_1',
    'pm_1': 'pm_1',
    'PM-2.5': 'pm_2_5',
    'PM-2-5': 'pm_2_5',
    'PM2.5': 'pm_2_5',
    'pm_2_5': 'pm_2_5',
    'PM-10': 'pm_10',
    'PM10': 'pm_10',
    'pm_10': 'pm_10',
    'TSP': 'tsp',
    'tsp': 'tsp',
    'CO': 'co',
    'co': 'co',
    'NO': 'no',
    'no': 'no',
    'NO2': 'no2',
    'no2': 'no2',
    'NOx': 'nox',
    'nox': 'nox',
    'SO2': 'so2',
    'so2': 'so2',
    'O3': 'o3',
    'o3': 'o3',
}


def filter_measurements(queryset, params):
    """
    Lọc danh sách dữ liệu đo đạc chất lượng không khí.
    - station_id: lọc theo id trạm hoặc mã trạm
    - station_code: lọc theo mã trạm
    - date_from, date_to: lọc theo khoảng thời gian measured_at
    - pollutant: lọc các bản ghi mà thông số ô nhiễm đó không NULL
    - min_value, max_value: lọc giá trị tối thiểu/tối đa cho pollutant được chọn
    """
    station_id = params.get('station_id')
    if station_id:
        st_ids = [s.strip() for s in station_id.split(',') if s.strip()]
        if len(st_ids) == 1:
            queryset = queryset.filter(Q(station_id=st_ids[0]) | Q(station__code=st_ids[0]))
        else:
            queryset = queryset.filter(Q(station_id__in=st_ids) | Q(station__code__in=st_ids))

    station_code = params.get('station_code')
    if station_code:
        queryset = queryset.filter(station__code__icontains=station_code)

    date_from = params.get('date_from')
    if date_from:
        dt_from = parse_datetime(date_from)
        if dt_from:
            queryset = queryset.filter(measured_at__gte=dt_from)

    date_to = params.get('date_to')
    if date_to:
        dt_to = parse_datetime(date_to)
        if dt_to:
            queryset = queryset.filter(measured_at__lte=dt_to)

    pollutant = params.get('pollutant')
    if pollutant and pollutant in POLLUTANT_FIELDS:
        kwargs_not_null = {f"{pollutant}__isnull": False}
        queryset = queryset.filter(**kwargs_not_null)

        min_val = params.get('min_value')
        if min_val is not None and min_val != '':
            try:
                queryset = queryset.filter(**{f"{pollutant}__gte": float(min_val)})
            except ValueError:
                pass

        max_val = params.get('max_value')
        if max_val is not None and max_val != '':
            try:
                queryset = queryset.filter(**{f"{pollutant}__lte": float(max_val)})
            except ValueError:
                pass

    ordering = params.get('ordering', '-measured_at')
    if ordering in ['measured_at', '-measured_at', 'id', '-id']:
        queryset = queryset.order_by(ordering)
    else:
        queryset = queryset.order_by('-measured_at')

    return queryset


def get_latest_measurements_per_station():
    """
    Lấy phép đo gần nhất của mỗi trạm đang có dữ liệu trong hệ thống.
    """
    latest_ids = (
        StationMeasurement.objects
        .values('station_id')
        .annotate(latest_id=Max('id'))
        .values_list('latest_id', flat=True)
    )
    return StationMeasurement.objects.filter(id__in=latest_ids).select_related('station').order_by('-measured_at')


def generate_measurement_csv_template():
    """
    Tạo nội dung file CSV mẫu cho dữ liệu đo đạc chất lượng không khí của trạm.
    Bao gồm UTF-8 BOM để Excel hiển thị tiếng Việt có dấu.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['stationId', 'stationCode', 'stationName', 'getTime', 'PM-1', 'PM-2.5', 'PM-10', 'TSP', 'CO', 'NO', 'NO2', 'NOx', 'SO2', 'O3'])
    writer.writerow([
        '29518862280522648049760863667', 'QN_TNMT_KHIHHA',
        'Quảng Ninh: UBND huyện Hải Hà (KK)',
        '2025-01-01T23:00:00',
        '', '', '', '0.2586', '2158.883', '', '6.0914', '3.1022', '2.7421', '89.5271'
    ])
    writer.writerow([
        '28601787986862666164115166945', 'KHCH_KHIXQU',
        'Quảng Ninh: Văn phòng C.ty than Khe Chàm (KK)',
        '2025-03-25T23:00:00',
        '4.1825', '3.4075', '2.2883', '6.1458', '', '11.1558', '3.8308', '15.4108', '5.9117', '32.82'
    ])

    csv_data = output.getvalue()
    return '\ufeff' + csv_data


def import_measurements_from_csv(file_obj, default_station_id=None):
    """
    Import chuỗi dữ liệu đo đạc từ file CSV.
    Tự động map cột ô nhiễm, bỏ qua cột khí tượng, nạp/cập nhật CSDL.
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
    if not reader.fieldnames:
        return {
            'success': False,
            'error': 'Tệp tin CSV rỗng hoặc không chứa dòng tiêu đề (header).'
        }

    raw_headers = [f.strip() for f in reader.fieldnames if f]

    time_col = None
    for col in raw_headers:
        if col.lower() in ['gettime', 'measured_at', 'measuredat', 'time', 'datetime', 'date']:
            time_col = col
            break

    if not time_col:
        return {
            'success': False,
            'error': 'File CSV thiếu cột thời gian đo đạc (yêu cầu cột: getTime hoặc measured_at).'
        }

    column_mapping = {}
    for col in raw_headers:
        clean_col = col.strip()
        if clean_col in CSV_POLLUTANT_MAP:
            column_mapping[col] = CSV_POLLUTANT_MAP[clean_col]

    if not column_mapping:
        return {
            'success': False,
            'error': 'File CSV không chứa bất kỳ cột thông số ô nhiễm nào hợp lệ (chấp nhận: PM-1, PM-2.5, PM-10, TSP, CO, NO, NO2, NOx, SO2, O3).'
        }

    total_rows = 0
    created_count = 0
    updated_count = 0
    error_count = 0
    errors = []

    station_cache = {}
    if default_station_id:
        try:
            st = Station.objects.get(Q(id=default_station_id) | Q(code=default_station_id))
            station_cache[default_station_id] = st
        except Station.DoesNotExist:
            pass

    records_to_process = []

    for idx, row in enumerate(reader, start=1):
        total_rows += 1

        time_str = (row.get(time_col) or '').strip()
        if not time_str:
            errors.append(f"Dòng {idx}: Thiếu thời gian đo đạc")
            error_count += 1
            continue

        measured_at = parse_datetime(time_str)
        if not measured_at:
            errors.append(f"Dòng {idx}: Định dạng thời gian '{time_str}' không hợp lệ (cần ISO 8601)")
            error_count += 1
            continue

        if is_naive(measured_at):
            measured_at = make_aware(measured_at, timezone=get_current_timezone())

        st_id = (row.get('stationId') or row.get('station_id') or row.get('id') or '').strip()
        st_code = (row.get('stationCode') or row.get('station_code') or row.get('code') or '').strip()
        st_name = (row.get('stationName') or row.get('station_name') or row.get('name') or '').strip()

        target_station = None
        key = st_id or st_code

        if key:
            if key in station_cache:
                target_station = station_cache[key]
            else:
                try:
                    target_station = Station.objects.get(Q(id=key) | Q(code=key))
                    station_cache[key] = target_station
                except Station.DoesNotExist:
                    st_id_val = st_id or key
                    st_name_val = st_name or st_code or st_id_val
                    target_station = Station.objects.create(
                        id=st_id_val,
                        code=st_code or None,
                        name=st_name_val
                    )
                    station_cache[key] = target_station
        elif default_station_id:
            target_station = station_cache.get(default_station_id)

        if not target_station:
            errors.append(f"Dòng {idx}: Không xác định được trạm (thiếu stationId/stationCode và không chọn trạm mặc định)")
            error_count += 1
            continue

        pollutants_payload = {}
        has_any_val = False
        for col_name, field_name in column_mapping.items():
            val_str = (row.get(col_name) or '').strip()
            if val_str:
                try:
                    pollutants_payload[field_name] = float(val_str)
                    has_any_val = True
                except ValueError:
                    pollutants_payload[field_name] = None
            else:
                pollutants_payload[field_name] = None

        if not has_any_val:
            continue

        records_to_process.append({
            'station': target_station,
            'measured_at': measured_at,
            'payload': pollutants_payload
        })

    if total_rows == 0:
        return {
            'success': False,
            'error': 'File CSV không có dữ liệu bản ghi nào.'
        }

    with transaction.atomic():
        for rec in records_to_process:
            defaults = rec['payload']
            meas, created = StationMeasurement.objects.update_or_create(
                station=rec['station'],
                measured_at=rec['measured_at'],
                defaults=defaults
            )
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


def export_measurements_csv(queryset):
    """
    Xuất danh sách dữ liệu đo đạc đã lọc ra tệp CSV.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'stationId', 'stationCode', 'stationName', 'measuredAt',
        'PM-1', 'PM-2.5', 'PM-10', 'TSP', 'CO', 'NO', 'NO2', 'NOx', 'SO2', 'O3'
    ])

    for m in queryset.select_related('station'):
        writer.writerow([
            m.station_id,
            m.station.code or '',
            m.station.name or '',
            m.measured_at.isoformat() if m.measured_at else '',
            m.pm_1 if m.pm_1 is not None else '',
            m.pm_2_5 if m.pm_2_5 is not None else '',
            m.pm_10 if m.pm_10 is not None else '',
            m.tsp if m.tsp is not None else '',
            m.co if m.co is not None else '',
            m.no if m.no is not None else '',
            m.no2 if m.no2 is not None else '',
            m.nox if m.nox is not None else '',
            m.so2 if m.so2 is not None else '',
            m.o3 if m.o3 is not None else '',
        ])

    csv_data = output.getvalue()
    return '\ufeff' + csv_data


