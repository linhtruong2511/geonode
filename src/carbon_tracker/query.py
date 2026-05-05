import json
import math
from dataclasses import dataclass
from datetime import datetime, time

from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000
DEFAULT_MISSION = "oco2_vn"
SUPPORTED_MISSIONS = {"oco2_vn", "gosat2_vn"}
VIETNAM_DEFAULT_BOUNDS = [8.18, 102.14, 23.39, 109.47]


@dataclass
class CarbonQueryContext:
    adapter: object
    queryset: object
    date_from: datetime | None = None
    date_to: datetime | None = None
    bbox: Polygon | None = None
    geometry: GEOSGeometry | None = None
    extra_filters: dict | None = None

    def metadata(self):
        return {
            "mission": self.adapter.key,
            "mission_label": self.adapter.label,
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "bbox": list(self.bbox.extent) if self.bbox else None,
            "geometry_type": self.geometry.geom_type if self.geometry else None,
            "extra_filters": self.extra_filters or {},
        }


def parse_positive_int(value, default, minimum=1, maximum=None, field_name="value"):
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field_name}: Gia tri phai la so nguyen.")
    if parsed < minimum:
        raise ValidationError(f"{field_name}: Gia tri toi thieu la {minimum}.")
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def parse_page_params(params):
    return (
        parse_positive_int(params.get("page"), 1, field_name="page"),
        parse_positive_int(
            params.get("page_size"),
            DEFAULT_PAGE_SIZE,
            maximum=MAX_PAGE_SIZE,
            field_name="page_size",
        ),
    )


def parse_granularity(params):
    granularity = params.get("granularity") or "day"
    if granularity not in {"day", "month"}:
        raise ValidationError("granularity: Chi ho tro day hoac month.")
    return granularity


def parse_mission(params):
    mission = (params.get("mission") or DEFAULT_MISSION).strip()
    if mission not in SUPPORTED_MISSIONS:
        raise ValidationError(
            "mission: Chi ho tro oco2_vn hoac gosat2_vn."
        )
    return mission


def parse_bbox(params, required=True):
    keys = ("sw_lat", "sw_lng", "ne_lat", "ne_lng")
    values = [params.get(key) for key in keys]
    if any(value in (None, "") for value in values):
        if required:
            raise ValidationError("bbox: Thieu toa do khung nhin ban do.")
        return None

    try:
        sw_lat, sw_lng, ne_lat, ne_lng = [float(value) for value in values]
    except (TypeError, ValueError):
        raise ValidationError("bbox: Toa do khung nhin khong hop le.")

    if not all(math.isfinite(value) for value in (sw_lat, sw_lng, ne_lat, ne_lng)):
        raise ValidationError("bbox: Toa do khung nhin khong hop le.")
    if not (-90 <= sw_lat <= 90 and -90 <= ne_lat <= 90):
        raise ValidationError("bbox: Vi do phai nam trong khoang -90 den 90.")
    if not (-180 <= sw_lng <= 180 and -180 <= ne_lng <= 180):
        raise ValidationError("bbox: Kinh do phai nam trong khoang -180 den 180.")
    if sw_lat >= ne_lat or sw_lng >= ne_lng:
        raise ValidationError(
            "bbox: Khung nhin phai co goc tay nam nho hon goc dong bac."
        )

    bbox = Polygon.from_bbox((sw_lng, sw_lat, ne_lng, ne_lat))
    bbox.srid = 4326
    return bbox


def parse_date_bound(value, is_end=False):
    if value in (None, ""):
        return None

    raw_value = str(value).strip()
    is_date_only = "T" not in raw_value and " " not in raw_value

    parsed = None if is_date_only else parse_datetime(raw_value)
    if parsed is None:
        parsed_date = parse_date(raw_value)
        if parsed_date is None:
            field_name = "date_to" if is_end else "date_from"
            raise ValidationError(f"{field_name}: Ngay phai theo dinh dang ISO.")
        parsed = datetime.combine(parsed_date, time.max if is_end else time.min)

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def parse_date_range(params):
    date_from = parse_date_bound(params.get("date_from"), is_end=False)
    date_to = parse_date_bound(params.get("date_to"), is_end=True)
    if date_from and date_to and date_from > date_to:
        raise ValidationError(
            "date_to: Ngay ket thuc phai lon hon hoac bang ngay bat dau."
        )
    return date_from, date_to


def parse_geojson_geometry(payload):
    geometry_payload = payload.get("geometry") if payload.get("type") == "Feature" else payload
    if not geometry_payload:
        raise ValidationError("geometry: Thieu geometry AOI.")
    try:
        geometry = GEOSGeometry(json.dumps(geometry_payload))
    except (TypeError, ValueError):
        raise ValidationError("geometry: GeoJSON AOI khong hop le.")

    if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValidationError("geometry: AOI phai la Polygon hoac MultiPolygon.")
    if geometry.srid is None:
        geometry.srid = 4326
    elif geometry.srid != 4326:
        geometry.transform(4326)
    return geometry


def parse_extra_filters(params):
    filters = {}
    for key in ("product_version", "processing_level", "sensor_name", "file_id", "file_name"):
        value = params.get(key)
        if value not in (None, ""):
            filters[key] = str(value).strip()
    return filters


def build_query_context(adapter, params, geometry=None, require_bbox=True):
    bbox = None
    if geometry is None:
        bbox = parse_bbox(params, required=require_bbox)
    date_from, date_to = parse_date_range(params)
    extra_filters = parse_extra_filters(params)
    queryset = adapter.get_filtered_queryset(
        bbox=bbox,
        geometry=geometry,
        date_from=date_from,
        date_to=date_to,
        extra_filters=extra_filters,
    )
    return CarbonQueryContext(
        adapter=adapter,
        queryset=queryset,
        date_from=date_from,
        date_to=date_to,
        bbox=bbox,
        geometry=geometry,
        extra_filters=extra_filters,
    )
