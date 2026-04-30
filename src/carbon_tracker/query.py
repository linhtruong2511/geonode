import json
import math
from dataclasses import dataclass
from datetime import datetime, time

from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.db.models import Avg, Count, Max, Min, StdDev
from django.db.models.functions import TruncDay, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from .models import OCO2Data

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000
HISTOGRAM_BIN_COUNT = 10
HISTOGRAM_SAMPLE_LIMIT = 50000


@dataclass
class CarbonQueryContext:
    queryset: object
    date_from: datetime | None = None
    date_to: datetime | None = None
    bbox: Polygon | None = None
    geometry: GEOSGeometry | None = None

    def metadata(self):
        return {
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "bbox": list(self.bbox.extent) if self.bbox else None,
            "geometry_type": self.geometry.geom_type if self.geometry else None,
        }


def parse_positive_int(value, default, minimum=1, maximum=None, field_name="value"):
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field_name}: Giá trị phải là số nguyên.")
    if parsed < minimum:
        raise ValidationError(f"{field_name}: Giá trị tối thiểu là {minimum}.")
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
        raise ValidationError("granularity: Chỉ hỗ trợ day hoặc month.")
    return granularity


def parse_bbox(params, required=True):
    keys = ("sw_lat", "sw_lng", "ne_lat", "ne_lng")
    values = [params.get(key) for key in keys]
    if any(value in (None, "") for value in values):
        if required:
            raise ValidationError("bbox: Thiếu tọa độ khung nhìn bản đồ.")
        return None

    try:
        sw_lat, sw_lng, ne_lat, ne_lng = [float(value) for value in values]
    except (TypeError, ValueError):
        raise ValidationError("bbox: Tọa độ khung nhìn không hợp lệ.")

    if not all(math.isfinite(value) for value in (sw_lat, sw_lng, ne_lat, ne_lng)):
        raise ValidationError("bbox: Tọa độ khung nhìn không hợp lệ.")
    if not (-90 <= sw_lat <= 90 and -90 <= ne_lat <= 90):
        raise ValidationError("bbox: Vĩ độ phải nằm trong khoảng -90 đến 90.")
    if not (-180 <= sw_lng <= 180 and -180 <= ne_lng <= 180):
        raise ValidationError("bbox: Kinh độ phải nằm trong khoảng -180 đến 180.")
    if sw_lat >= ne_lat or sw_lng >= ne_lng:
        raise ValidationError("bbox: Khung nhìn phải có góc tây nam nhỏ hơn góc đông bắc.")

    bbox = Polygon.from_bbox((sw_lng, sw_lat, ne_lng, ne_lat))
    bbox.srid = 4326
    return bbox


def parse_date_bound(value, is_end=False):
    if value in (None, ""):
        return None

    parsed = parse_datetime(value)
    if parsed is None:
        parsed_date = parse_date(value)
        if parsed_date is None:
            field_name = "date_to" if is_end else "date_from"
            raise ValidationError(f"{field_name}: Ngày phải theo định dạng ISO.")
        parsed = datetime.combine(parsed_date, time.max if is_end else time.min)

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def parse_date_range(params):
    date_from = parse_date_bound(params.get("date_from"), is_end=False)
    date_to = parse_date_bound(params.get("date_to"), is_end=True)
    if date_from and date_to and date_from > date_to:
        raise ValidationError("date_to: Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.")
    return date_from, date_to


def parse_geojson_geometry(payload):
    geometry_payload = payload.get("geometry") if payload.get("type") == "Feature" else payload
    if not geometry_payload:
        raise ValidationError("geometry: Thiếu geometry AOI.")
    try:
        geometry = GEOSGeometry(json.dumps(geometry_payload))
    except (TypeError, ValueError):
        raise ValidationError("geometry: GeoJSON AOI không hợp lệ.")

    if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValidationError("geometry: AOI phải là Polygon hoặc MultiPolygon.")
    if geometry.srid is None:
        geometry.srid = 4326
    elif geometry.srid != 4326:
        geometry.transform(4326)
    return geometry


def build_query_context(params, geometry=None, require_bbox=True):
    queryset = OCO2Data.objects.all()
    bbox = None
    if geometry is not None:
        queryset = queryset.filter(location__intersects=geometry)
    else:
        bbox = parse_bbox(params, required=require_bbox)
        if bbox is not None:
            queryset = queryset.filter(location__intersects=bbox)

    date_from, date_to = parse_date_range(params)
    if date_from:
        queryset = queryset.filter(acquisition_time__gte=date_from)
    if date_to:
        queryset = queryset.filter(acquisition_time__lte=date_to)

    return CarbonQueryContext(
        queryset=queryset,
        date_from=date_from,
        date_to=date_to,
        bbox=bbox,
        geometry=geometry,
    )


def build_summary(queryset):
    aggregate = queryset.aggregate(
        total_records=Count("sounding_id"),
        xco2_avg=Avg("xco2"),
        xco2_min=Min("xco2"),
        xco2_max=Max("xco2"),
        xco2_stddev=StdDev("xco2"),
        first_acquisition_time=Min("acquisition_time"),
        latest_acquisition_time=Max("acquisition_time"),
    )
    active_days = (
        queryset.annotate(day=TruncDay("acquisition_time"))
        .values("day")
        .distinct()
        .count()
    )
    aggregate["active_days"] = active_days
    return aggregate


def build_timeseries(queryset, granularity):
    trunc_fn = TruncMonth if granularity == "month" else TruncDay
    rows = (
        queryset.annotate(period=trunc_fn("acquisition_time"))
        .values("period")
        .annotate(
            count=Count("sounding_id"),
            xco2_avg=Avg("xco2"),
            xco2_min=Min("xco2"),
            xco2_max=Max("xco2"),
        )
        .order_by("period")
    )
    return [
        {
            "period": row["period"].date().isoformat() if row["period"] else None,
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
            "xco2_min": row["xco2_min"],
            "xco2_max": row["xco2_max"],
        }
        for row in rows
    ]


def build_top_days(queryset, limit=7):
    rows = (
        queryset.annotate(day=TruncDay("acquisition_time"))
        .values("day")
        .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
        .order_by("-count", "-day")[:limit]
    )
    return [
        {
            "date": row["day"].date().isoformat() if row["day"] else None,
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
        }
        for row in rows
    ]


def build_top_sources(queryset, limit=10):
    rows = (
        queryset.values("file_path")
        .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
        .order_by("-count", "file_path")[:limit]
    )
    return [
        {
            "file_path": row["file_path"] or "Không xác định",
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
        }
        for row in rows
    ]


def build_histogram(queryset, bin_count=HISTOGRAM_BIN_COUNT):
    xco2_range = queryset.aggregate(xco2_min=Min("xco2"), xco2_max=Max("xco2"))
    xco2_min = xco2_range["xco2_min"]
    xco2_max = xco2_range["xco2_max"]
    if xco2_min is None or xco2_max is None:
        return {"labels": [], "values": [], "sampled": False}

    if xco2_min == xco2_max:
        return {
            "labels": [f"{xco2_min:.2f}"],
            "values": [queryset.count()],
            "sampled": False,
        }

    width = (xco2_max - xco2_min) / bin_count
    bins = [0] * bin_count
    sampled = queryset.count() > HISTOGRAM_SAMPLE_LIMIT
    values = queryset.order_by().values_list("xco2", flat=True)[:HISTOGRAM_SAMPLE_LIMIT]
    for value in values:
        index = min(int((value - xco2_min) / width), bin_count - 1)
        bins[index] += 1

    labels = []
    for index in range(bin_count):
        start = xco2_min + width * index
        end = start + width
        labels.append(f"{start:.1f}-{end:.1f}")
    return {"labels": labels, "values": bins, "sampled": sampled}


def build_report_payload(query_context, granularity):
    queryset = query_context.queryset
    return {
        "filters": query_context.metadata(),
        "summary": build_summary(queryset),
        "timeseries": build_timeseries(queryset, granularity),
        "histogram": build_histogram(queryset),
        "top_days": build_top_days(queryset),
        "top_sources": build_top_sources(queryset),
        "granularity": granularity,
    }
