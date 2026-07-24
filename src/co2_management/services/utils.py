import csv
from django.db import transaction
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_naive, make_aware, get_current_timezone
import io

from co2_management.models import StationMeasurement

POLLUTANT_FIELDS = [
    "pm_1",
    "pm_2_5",
    "pm_10",
    "tsp",
    "co",
    "no",
    "no2",
    "nox",
    "so2",
    "o3",
]

CSV_POLLUTANT_MAP = {
    "PM-1": "pm_1",
    "PM1": "pm_1",
    "pm_1": "pm_1",
    "PM-2.5": "pm_2_5",
    "PM-2-5": "pm_2_5",
    "PM2.5": "pm_2_5",
    "pm_2_5": "pm_2_5",
    "PM-10": "pm_10",
    "PM10": "pm_10",
    "pm_10": "pm_10",
    "TSP": "tsp",
    "tsp": "tsp",
    "CO": "co",
    "co": "co",
    "NO": "no",
    "no": "no",
    "NO2": "no2",
    "no2": "no2",
    "NOx": "nox",
    "nox": "nox",
    "SO2": "so2",
    "so2": "so2",
    "O3": "o3",
    "o3": "o3",
}


def parse_csv_file_stream(file_obj):
    """Đọc và parse stream tệp CSV (hỗ trợ UTF-8, UTF-8-SIG, Latin-1)"""
    if hasattr(file_obj, "read"):
        content = file_obj.read()
        if isinstance(content, bytes):
            try:
                decoded = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                try:
                    decoded = content.decode("utf-8")
                except UnicodeDecodeError:
                    decoded = content.decode("latin-1")
            stream = io.StringIO(decoded)
        else:
            stream = io.StringIO(content)
    else:
        stream = file_obj

    return csv.DictReader(stream)


def extract_measurement_csv_headers(reader):
    """
    Trích xuất & kiểm tra tính hợp lệ của header file CSV đo đạc:
    - Tìm cột thời gian đo (getTime, measured_at, time...)
    - Ánh xạ các cột chỉ số ô nhiễm (PM-1, PM-2.5, PM-10, TSP, CO, NO, NO2, NOx, SO2, O3)
    Trả về tuple: (time_col, column_mapping, error_dict)
    """
    if not reader.fieldnames:
        return (
            None,
            None,
            {
                "success": False,
                "error": "Tệp tin CSV rỗng hoặc không chứa dòng tiêu đề (header).",
            },
        )

    raw_headers = [f.strip() for f in reader.fieldnames if f]

    time_col = None
    for col in raw_headers:
        if col.lower() in [
            "gettime",
            "measured_at",
            "measuredat",
            "time",
            "datetime",
            "date",
        ]:
            time_col = col
            break

    if not time_col:
        return (
            None,
            None,
            {
                "success": False,
                "error": "File CSV thiếu cột thời gian đo đạc (yêu cầu cột: getTime hoặc measured_at).",
            },
        )

    column_mapping = {}
    for col in raw_headers:
        clean_col = col.strip()
        if clean_col in CSV_POLLUTANT_MAP:
            column_mapping[col] = CSV_POLLUTANT_MAP[clean_col]

    if not column_mapping:
        return (
            None,
            None,
            {
                "success": False,
                "error": "File CSV không chứa bất kỳ cột thông số ô nhiễm nào hợp lệ (chấp nhận: PM-1, PM-2.5, PM-10, TSP, CO, NO, NO2, NOx, SO2, O3).",
            },
        )

    return time_col, column_mapping, None


def parse_row_measured_at(row, time_col, idx):
    """Parse thời gian đo từ một dòng CSV sang datetime timezone-aware"""
    time_str = (row.get(time_col) or "").strip()
    if not time_str:
        return None, f"Dòng {idx}: Thiếu thời gian đo đạc"

    measured_at = parse_datetime(time_str)
    if not measured_at:
        return (
            None,
            f"Dòng {idx}: Định dạng thời gian '{time_str}' không hợp lệ (cần ISO 8601)",
        )

    if is_naive(measured_at):
        measured_at = make_aware(measured_at, timezone=get_current_timezone())

    return measured_at, None


def parse_row_pollutants(row, column_mapping):
    """Trích xuất các chỉ số ô nhiễm từ dòng CSV"""
    pollutants_payload = {}
    has_any_val = False
    for col_name, field_name in column_mapping.items():
        val_str = (row.get(col_name) or "").strip()
        if val_str:
            try:
                pollutants_payload[field_name] = float(val_str)
                has_any_val = True
            except ValueError:
                pollutants_payload[field_name] = None
        else:
            pollutants_payload[field_name] = None

    if not has_any_val:
        return None
    return pollutants_payload


def bulk_save_station_measurements(records_to_process):
    """Thực thi update_or_create hàng loạt trong transaction atomic"""
    created_count = 0
    updated_count = 0
    with transaction.atomic():
        for rec in records_to_process:
            defaults = rec["payload"]
            meas, created = StationMeasurement.objects.update_or_create(
                station=rec["station"],
                measured_at=rec["measured_at"],
                defaults=defaults,
            )
            if created:
                created_count += 1
            else:
                updated_count += 1
    return created_count, updated_count
