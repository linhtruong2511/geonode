import json
import math
from dataclasses import dataclass
from datetime import datetime, time

from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.db.models import Avg, CharField, Count, IntegerField, Max, Min, Q, StdDev, Value
from django.db.models.functions import Coalesce, TruncDay, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from .models import VietNamOCO2Data

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000
HISTOGRAM_BIN_COUNT = 10
HISTOGRAM_SAMPLE_LIMIT = 50000
TOP_LIMIT = 10
QUALITY_GOOD_FLAG = 0


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

    parsed = parse_datetime(value)
    if parsed is None:
        parsed_date = parse_date(value)
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


def build_query_context(params, geometry=None, require_bbox=True):
    queryset = VietNamOCO2Data.objects.all()
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
        uncertainty_avg=Avg("xco2_uncertainty"),
        uncertainty_max=Max("xco2_uncertainty"),
        first_acquisition_time=Min("acquisition_time"),
        latest_acquisition_time=Max("acquisition_time"),
        unique_source_files=Count("source_file", distinct=True),
        unique_source_folders=Count("source_folder", distinct=True),
        unique_orbits=Count("orbit", distinct=True),
        unique_operation_modes=Count("operation_mode", distinct=True),
        latitude_min=Min("latitude"),
        latitude_max=Max("latitude"),
        longitude_min=Min("longitude"),
        longitude_max=Max("longitude"),
        uncertainty_known_count=Count(
            "sounding_id", filter=Q(xco2_uncertainty__isnull=False)
        ),
        orbit_known_count=Count("sounding_id", filter=Q(orbit__isnull=False)),
        operation_mode_known_count=Count(
            "sounding_id", filter=Q(operation_mode__isnull=False) & ~Q(operation_mode="")
        ),
    )
    active_days = (
        queryset.annotate(day=TruncDay("acquisition_time"))
        .values("day")
        .distinct()
        .count()
    )
    quality_counts = queryset.aggregate(
        quality_known_count=Count("sounding_id", filter=Q(xco2_quality_flag__isnull=False)),
        quality_good_count=Count(
            "sounding_id", filter=Q(xco2_quality_flag=QUALITY_GOOD_FLAG)
        ),
        quality_flagged_count=Count(
            "sounding_id",
            filter=Q(xco2_quality_flag__isnull=False)
            & ~Q(xco2_quality_flag=QUALITY_GOOD_FLAG),
        ),
    )
    aggregate.update(quality_counts)
    aggregate["active_days"] = active_days
    total_records = aggregate.get("total_records") or 0
    known_quality_count = aggregate.get("quality_known_count") or 0
    good_quality_count = aggregate.get("quality_good_count") or 0
    aggregate["quality_good_ratio"] = (
        (good_quality_count / known_quality_count) * 100 if known_quality_count else None
    )
    aggregate["uncertainty_known_ratio"] = (
        ((aggregate.get("uncertainty_known_count") or 0) / total_records) * 100
        if total_records
        else None
    )
    aggregate["orbit_known_ratio"] = (
        ((aggregate.get("orbit_known_count") or 0) / total_records) * 100
        if total_records
        else None
    )
    aggregate["operation_mode_known_ratio"] = (
        ((aggregate.get("operation_mode_known_count") or 0) / total_records) * 100
        if total_records
        else None
    )
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
            uncertainty_avg=Avg("xco2_uncertainty"),
            quality_known_count=Count(
                "sounding_id", filter=Q(xco2_quality_flag__isnull=False)
            ),
            quality_good_count=Count(
                "sounding_id", filter=Q(xco2_quality_flag=QUALITY_GOOD_FLAG)
            ),
        )
        .order_by("period")
    )
    payload = []
    for row in rows:
        known_quality_count = row["quality_known_count"] or 0
        payload.append(
            {
                "period": row["period"].date().isoformat() if row["period"] else None,
                "count": row["count"],
                "xco2_avg": row["xco2_avg"],
                "xco2_min": row["xco2_min"],
                "xco2_max": row["xco2_max"],
                "uncertainty_avg": row["uncertainty_avg"],
                "quality_good_ratio": (
                    (row["quality_good_count"] / known_quality_count) * 100
                    if known_quality_count
                    else None
                ),
            }
        )
    return payload


def build_top_days(queryset, limit=7):
    rows = (
        queryset.annotate(day=TruncDay("acquisition_time"))
        .values("day")
        .annotate(
            count=Count("sounding_id"),
            xco2_avg=Avg("xco2"),
            uncertainty_avg=Avg("xco2_uncertainty"),
        )
        .order_by("-count", "-day")[:limit]
    )
    return [
        {
            "date": row["day"].date().isoformat() if row["day"] else None,
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
            "uncertainty_avg": row["uncertainty_avg"],
        }
        for row in rows
    ]


def build_top_sources(queryset, limit=TOP_LIMIT):
    rows = (
        queryset.values("source_file")
        .annotate(
            count=Count("sounding_id"),
            xco2_avg=Avg("xco2"),
            uncertainty_avg=Avg("xco2_uncertainty"),
        )
        .order_by("-count", "source_file")[:limit]
    )
    return [
        {
            "source_file": row["source_file"] or "Khong xac dinh",
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
            "uncertainty_avg": row["uncertainty_avg"],
        }
        for row in rows
    ]


def build_source_folders(queryset, limit=TOP_LIMIT):
    rows = (
        queryset.values("source_folder")
        .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
        .order_by("-count", "source_folder")[:limit]
    )
    return [
        {
            "source_folder": row["source_folder"] or "Khong xac dinh",
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
        }
        for row in rows
    ]


def build_operation_modes(queryset, limit=TOP_LIMIT):
    rows = (
        queryset.exclude(operation_mode__isnull=True)
        .exclude(operation_mode="")
        .annotate(
            mode_label=Coalesce(
                "operation_mode", Value(""), output_field=CharField()
            )
        )
        .values("mode_label")
        .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
        .order_by("-count", "mode_label")[:limit]
    )
    return [
        {
            "operation_mode": row["mode_label"] or "Khong xac dinh",
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
        }
        for row in rows
    ]


def build_quality_breakdown(queryset):
    rows = (
        queryset.annotate(
            quality_label=Coalesce(
                "xco2_quality_flag", Value(-999999), output_field=IntegerField()
            ),
        )
        .values("quality_label")
        .annotate(count=Count("sounding_id"))
        .order_by("quality_label")
    )
    payload = []
    for row in rows:
        quality_label = row["quality_label"]
        if quality_label == -999999:
            label = "Khong gan co"
        elif quality_label == QUALITY_GOOD_FLAG:
            label = "0 (tot)"
        else:
            label = str(quality_label)
        payload.append({"label": label, "value": row["count"]})
    return payload


def build_top_orbits(queryset, limit=TOP_LIMIT):
    rows = (
        queryset.exclude(orbit__isnull=True)
        .values("orbit")
        .annotate(
            count=Count("sounding_id"),
            xco2_avg=Avg("xco2"),
            uncertainty_avg=Avg("xco2_uncertainty"),
        )
        .order_by("-count", "orbit")[:limit]
    )
    return [
        {
            "orbit": row["orbit"],
            "count": row["count"],
            "xco2_avg": row["xco2_avg"],
            "uncertainty_avg": row["uncertainty_avg"],
        }
        for row in rows
    ]


def build_data_completeness(summary):
    return [
        {
            "label": "Co uncertainty",
            "count": summary.get("uncertainty_known_count") or 0,
            "ratio": summary.get("uncertainty_known_ratio"),
        },
        {
            "label": "Co quality flag",
            "count": summary.get("quality_known_count") or 0,
            "ratio": (
                ((summary.get("quality_known_count") or 0) / (summary.get("total_records") or 1))
                * 100
                if summary.get("total_records")
                else None
            ),
        },
        {
            "label": "Co orbit",
            "count": summary.get("orbit_known_count") or 0,
            "ratio": summary.get("orbit_known_ratio"),
        },
        {
            "label": "Co operation mode",
            "count": summary.get("operation_mode_known_count") or 0,
            "ratio": summary.get("operation_mode_known_ratio"),
        },
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
    summary = build_summary(queryset)
    operation_modes = build_operation_modes(queryset)
    top_sources = build_top_sources(queryset)
    source_folders = build_source_folders(queryset)
    top_orbits = build_top_orbits(queryset)
    quality_breakdown = build_quality_breakdown(queryset)
    data_completeness = build_data_completeness(summary)
    dominant_mode = operation_modes[0] if operation_modes else None
    dominant_source = top_sources[0] if top_sources else None
    dominant_folder = source_folders[0] if source_folders else None
    top_orbit = top_orbits[0] if top_orbits else None

    return {
        "filters": query_context.metadata(),
        "summary": summary,
        "timeseries": build_timeseries(queryset, granularity),
        "histogram": build_histogram(queryset),
        "top_days": build_top_days(queryset),
        "top_sources": top_sources,
        "source_folders": source_folders,
        "operation_modes": operation_modes,
        "quality_breakdown": quality_breakdown,
        "top_orbits": top_orbits,
        "data_completeness": data_completeness,
        "insights": {
            "dominant_operation_mode": dominant_mode,
            "dominant_source_file": dominant_source,
            "dominant_source_folder": dominant_folder,
            "top_orbit": top_orbit,
        },
        "granularity": granularity,
    }
