import os
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import Polygon
from django.core.cache import cache
from django.db import connection
from django.db.models import Avg, CharField, Count, IntegerField, Max, Min, Q, StdDev, Value
from django.db.models.functions import Coalesce, TruncDay, TruncMonth

from .models import (
    CloudInformation,
    GosatProduct,
    H5DatasetCatalog,
    L1QualitySummary,
    RetrievalResult,
    Sounding,
    VietNamOCO2Data,
)
from .serializers import serialize_gosat_feature, serialize_oco2_feature

HISTOGRAM_BIN_COUNT = 10
HISTOGRAM_SAMPLE_LIMIT = 50000
TOP_LIMIT = 10
QUALITY_GOOD_FLAG = 0
VIETNAM_DEFAULT_BOUNDS = [6.5, 102.1, 23.4, 117.5]  # Bao gồm cả Hoàng Sa, Trường Sa
VIETNAM_BOUNDS_POLYGON = Polygon.from_bbox(
    (
        VIETNAM_DEFAULT_BOUNDS[1],
        VIETNAM_DEFAULT_BOUNDS[0],
        VIETNAM_DEFAULT_BOUNDS[3],
        VIETNAM_DEFAULT_BOUNDS[2],
    )
)
VIETNAM_BOUNDS_POLYGON.srid = 4326
DEFAULT_STORAGE_ROOTS = [
    "/data/oco2_storage",
    "/data/gosat_storage",
    "D:/Work/Truong_Teacher/DATA",
]
XARRAY_ENGINES = ("h5netcdf", "netcdf4")


def get_table_row_estimate(db_table, fallback_queryset):
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(reltuples, 0)::bigint
                FROM pg_class
                WHERE oid = %s::regclass
                """,
                [db_table],
            )
            row = cursor.fetchone()
    except Exception:
        return fallback_queryset.count()
    return max(int(row[0] if row else 0), 0)


def serialize_value(value, max_length=240):
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [serialize_value(item, max_length=max_length) for item in list(value)[:20]]
    if isinstance(value, dict):
        return {
            str(key): serialize_value(item, max_length=max_length)
            for key, item in list(value.items())[:20]
        }
    text = str(value)
    if len(text) > max_length:
        return text[: max_length - 3] + "..."
    return text


def summarize_attrs(attrs, limit=20):
    return [
        {"key": str(key), "value": serialize_value(value)}
        for key, value in list((attrs or {}).items())[:limit]
    ]


def summarize_data_array(name, data_array):
    return {
        "name": name,
        "dtype": str(data_array.dtype),
        "dims": list(data_array.dims),
        "shape": list(data_array.shape),
        "size": int(data_array.size),
        "attrs": summarize_attrs(getattr(data_array, "attrs", {}), limit=10),
    }


def iter_storage_roots():
    configured_roots = list(getattr(settings, "CARBON_TRACKER_STORAGE_ROOTS", []) or [])
    local_root = getattr(settings, "LOCAL_ROOT", None)
    project_roots = [
        getattr(settings, "BASE_DIR", None),
        local_root,
        Path(local_root).parent if local_root else None,
        os.getcwd(),
    ]
    seen = set()
    for raw_path in configured_roots + DEFAULT_STORAGE_ROOTS + project_roots:
        if not raw_path:
            continue
        path = Path(raw_path)
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        yield path


def candidate_suffixes(raw_path):
    if not raw_path:
        return []
    normalized = str(raw_path).replace("\\", "/")
    parts = [part for part in normalized.split("/") if part and ":" not in part]
    suffixes = []
    for size in range(1, min(len(parts), 6) + 1):
        suffixes.append(Path(*parts[-size:]))
    return suffixes


def resolve_existing_path(candidates):
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        try:
            normalized = Path(candidate).expanduser().resolve(strict=False)
        except Exception:
            normalized = Path(candidate)
        key = str(normalized)
        if key in seen:
            continue
        seen.add(key)
        if normalized.is_file():
            return normalized
    return None


def build_histogram(queryset, value_field, count_field="pk", bin_count=HISTOGRAM_BIN_COUNT):
    value_range = queryset.aggregate(value_min=Min(value_field), value_max=Max(value_field))
    value_min = value_range["value_min"]
    value_max = value_range["value_max"]
    if value_min is None or value_max is None:
        return {"labels": [], "values": [], "sampled": False}

    if value_min == value_max:
        return {
            "labels": [f"{value_min:.2f}"],
            "values": [queryset.count()],
            "sampled": False,
        }

    width = (value_max - value_min) / bin_count
    bins = [0] * bin_count
    sampled = queryset.count() > HISTOGRAM_SAMPLE_LIMIT
    values = queryset.order_by().values_list(value_field, flat=True)[:HISTOGRAM_SAMPLE_LIMIT]
    for value in values:
        if value is None:
            continue
        index = min(int((value - value_min) / width), bin_count - 1)
        bins[index] += 1

    labels = []
    for index in range(bin_count):
        start = value_min + width * index
        end = start + width
        labels.append(f"{start:.1f}-{end:.1f}")
    return {"labels": labels, "values": bins, "sampled": sampled}


def build_quality_breakdown(queryset, field_name, count_field):
    rows = (
        queryset.annotate(
            quality_label=Coalesce(
                field_name, Value(-999999), output_field=IntegerField()
            )
        )
        .values("quality_label")
        .annotate(count=Count(count_field))
        .order_by("quality_label")
    )
    payload = []
    for row in rows:
        quality_label = row["quality_label"]
        if quality_label == -999999:
            label = "Không gắn cờ"
        elif quality_label == QUALITY_GOOD_FLAG:
            label = "0 (tốt)"
        else:
            label = str(quality_label)
        payload.append({"label": label, "value": row["count"]})
    return payload


def build_timeseries(
    queryset,
    *,
    date_field,
    count_field,
    xco2_field,
    uncertainty_field,
    quality_field,
    granularity,
):
    trunc_fn = TruncMonth if granularity == "month" else TruncDay
    rows = (
        queryset.annotate(period=trunc_fn(date_field))
        .values("period")
        .annotate(
            count=Count(count_field),
            xco2_avg=Avg(xco2_field),
            xco2_min=Min(xco2_field),
            xco2_max=Max(xco2_field),
            uncertainty_avg=Avg(uncertainty_field),
            quality_known_count=Count(count_field, filter=Q(**{f"{quality_field}__isnull": False})),
            quality_good_count=Count(count_field, filter=Q(**{quality_field: QUALITY_GOOD_FLAG})),
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


def build_top_days(queryset, *, date_field, count_field, xco2_field, uncertainty_field, limit=7):
    rows = (
        queryset.annotate(day=TruncDay(date_field))
        .values("day")
        .annotate(
            count=Count(count_field),
            xco2_avg=Avg(xco2_field),
            uncertainty_avg=Avg(uncertainty_field),
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


class BaseMissionAdapter:
    key = ""
    label = ""
    detail_type = ""

    def get_filtered_queryset(
        self,
        *,
        bbox=None,
        geometry=None,
        date_from=None,
        date_to=None,
        extra_filters=None,
    ):
        queryset = self.base_queryset()
        queryset = self.apply_spatial_filters(queryset, bbox=bbox, geometry=geometry)
        queryset = self.apply_date_filters(queryset, date_from=date_from, date_to=date_to)
        queryset = self.apply_extra_filters(queryset, extra_filters or {})
        return queryset

    def base_queryset(self):
        raise NotImplementedError

    def apply_spatial_filters(self, queryset, *, bbox=None, geometry=None):
        raise NotImplementedError

    def apply_date_filters(self, queryset, *, date_from=None, date_to=None):
        raise NotImplementedError

    def apply_extra_filters(self, queryset, extra_filters):
        return queryset

    def serialize_features(self, records):
        raise NotImplementedError

    def build_report_payload(self, query_context, granularity):
        raise NotImplementedError

    def get_overview(self):
        raise NotImplementedError

    def get_record(self, record_key):
        raise NotImplementedError

    def build_file_detail_payload(self, record):
        raise NotImplementedError

    def ui_payload(self):
        return {
            "key": self.key,
            "label": self.label,
            "detail_type": self.detail_type,
        }


class OCO2MissionAdapter(BaseMissionAdapter):
    key = "oco2_vn"
    label = "OCO-2 Vietnam"
    detail_type = "nc4"

    def base_queryset(self):
        return VietNamOCO2Data.objects.all()

    def apply_spatial_filters(self, queryset, *, bbox=None, geometry=None):
        if geometry is not None:
            return queryset.filter(location__intersects=geometry)
        if bbox is not None:
            return queryset.filter(location__intersects=bbox)
        return queryset

    def apply_date_filters(self, queryset, *, date_from=None, date_to=None):
        if date_from:
            queryset = queryset.filter(acquisition_time__gte=date_from)
        if date_to:
            queryset = queryset.filter(acquisition_time__lte=date_to)
        return queryset

    def serialize_features(self, records):
        return [serialize_oco2_feature(record) for record in records]

    def get_overview(self):
        cache_key = "carbon_tracker:overview:oco2_vn"
        overview = cache.get(cache_key)
        if overview is None:
            first_acquisition_time = (
                VietNamOCO2Data.objects.order_by("acquisition_time")
                .values_list("acquisition_time", flat=True)
                .first()
            )
            latest_acquisition_time = (
                VietNamOCO2Data.objects.order_by("-acquisition_time")
                .values_list("acquisition_time", flat=True)
                .first()
            )
            overview = {
                "total_records": get_table_row_estimate(
                    VietNamOCO2Data._meta.db_table,
                    VietNamOCO2Data.objects.all(),
                ),
                "first_acquisition_time": first_acquisition_time,
                "latest_acquisition_time": latest_acquisition_time,
            }
            cache.set(cache_key, overview, timeout=60 * 10)
        return overview

    def build_report_payload(self, query_context, granularity):
        queryset = query_context.queryset
        summary = queryset.aggregate(
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
            unique_operation_modes=Count("operation_mode", distinct=True),
            unique_orbits=Count("orbit", distinct=True),
            latitude_min=Min("latitude"),
            latitude_max=Max("latitude"),
            longitude_min=Min("longitude"),
            longitude_max=Max("longitude"),
            uncertainty_known_count=Count("sounding_id", filter=Q(xco2_uncertainty__isnull=False)),
            quality_known_count=Count("sounding_id", filter=Q(xco2_quality_flag__isnull=False)),
            quality_good_count=Count("sounding_id", filter=Q(xco2_quality_flag=QUALITY_GOOD_FLAG)),
            orbit_known_count=Count("sounding_id", filter=Q(orbit__isnull=False)),
            operation_mode_known_count=Count(
                "sounding_id",
                filter=Q(operation_mode__isnull=False) & ~Q(operation_mode=""),
            ),
        )
        summary["active_days"] = (
            queryset.annotate(day=TruncDay("acquisition_time")).values("day").distinct().count()
        )
        total_records = summary.get("total_records") or 0
        quality_known_count = summary.get("quality_known_count") or 0
        summary["quality_good_ratio"] = (
            ((summary.get("quality_good_count") or 0) / quality_known_count) * 100
            if quality_known_count
            else None
        )
        for label in ("uncertainty", "orbit", "operation_mode"):
            count = summary.get(f"{label}_known_count") or 0
            summary[f"{label}_known_ratio"] = (count / total_records) * 100 if total_records else None

        top_sources = (
            queryset.values("source_file")
            .annotate(
                count=Count("sounding_id"),
                xco2_avg=Avg("xco2"),
                uncertainty_avg=Avg("xco2_uncertainty"),
            )
            .order_by("-count", "source_file")[:TOP_LIMIT]
        )
        secondary_items = (
            queryset.values("source_folder")
            .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
            .order_by("-count", "source_folder")[:TOP_LIMIT]
        )
        operation_modes = (
            queryset.exclude(operation_mode__isnull=True)
            .exclude(operation_mode="")
            .annotate(mode_label=Coalesce("operation_mode", Value(""), output_field=CharField()))
            .values("mode_label")
            .annotate(count=Count("sounding_id"), xco2_avg=Avg("xco2"))
            .order_by("-count", "mode_label")[:TOP_LIMIT]
        )

        data_completeness = [
            {
                "label": "Có uncertainty",
                "count": summary.get("uncertainty_known_count") or 0,
                "ratio": summary.get("uncertainty_known_ratio"),
            },
            {
                "label": "Có quality flag",
                "count": summary.get("quality_known_count") or 0,
                "ratio": (
                    ((summary.get("quality_known_count") or 0) / total_records) * 100
                    if total_records
                    else None
                ),
            },
            {
                "label": "Có orbit",
                "count": summary.get("orbit_known_count") or 0,
                "ratio": summary.get("orbit_known_ratio"),
            },
            {
                "label": "Có operation mode",
                "count": summary.get("operation_mode_known_count") or 0,
                "ratio": summary.get("operation_mode_known_ratio"),
            },
        ]

        return {
            "mission": self.key,
            "mission_label": self.label,
            "detail_type": self.detail_type,
            "filters": query_context.metadata(),
            "summary": summary,
            "timeseries": build_timeseries(
                queryset,
                date_field="acquisition_time",
                count_field="sounding_id",
                xco2_field="xco2",
                uncertainty_field="xco2_uncertainty",
                quality_field="xco2_quality_flag",
                granularity=granularity,
            ),
            "histogram": build_histogram(queryset, "xco2", count_field="sounding_id"),
            "top_days": build_top_days(
                queryset,
                date_field="acquisition_time",
                count_field="sounding_id",
                xco2_field="xco2",
                uncertainty_field="xco2_uncertainty",
            ),
            "top_sources": [
                {
                    "label": row["source_file"] or "Không xác định",
                    "count": row["count"],
                    "xco2_avg": row["xco2_avg"],
                    "uncertainty_avg": row["uncertainty_avg"],
                    "source_file": row["source_file"] or "Không xác định",
                }
                for row in top_sources
            ],
            "secondary_items": [
                {
                    "label": row["source_folder"] or "Không xác định",
                    "count": row["count"],
                    "xco2_avg": row["xco2_avg"],
                    "type": "source_folder",
                }
                for row in secondary_items
            ],
            "quality_breakdown": build_quality_breakdown(
                queryset,
                "xco2_quality_flag",
                "sounding_id",
            ),
            "data_completeness": data_completeness,
            "insights": {
                "dominant_source": (
                    {
                        "label": (top_sources[0]["source_file"] or "Không xác định"),
                        "count": top_sources[0]["count"],
                    }
                    if top_sources
                    else None
                ),
                "secondary_focus": (
                    {
                        "label": (secondary_items[0]["source_folder"] or "Không xác định"),
                        "count": secondary_items[0]["count"],
                    }
                    if secondary_items
                    else None
                ),
                "metadata_readiness": {
                    "mode_known_count": summary.get("operation_mode_known_count") or 0,
                    "orbit_known_count": summary.get("orbit_known_count") or 0,
                },
                "operation_modes": [
                    {
                        "label": row["mode_label"] or "Không xác định",
                        "count": row["count"],
                        "xco2_avg": row["xco2_avg"],
                    }
                    for row in operation_modes
                ],
            },
            "ui_context": {
                "source_chart_title": "File nguồn xuất hiện nhiều",
                "secondary_title": "Thư mục nguồn nổi bật",
                "secondary_empty": "Chưa có thư mục nguồn",
                "table_variant": "oco2",
            },
        }

    def get_record(self, record_key):
        return (
            VietNamOCO2Data.objects.filter(sounding_id=record_key)
            .only(
                "sounding_id",
                "acquisition_time",
                "xco2",
                "xco2_uncertainty",
                "xco2_quality_flag",
                "orbit",
                "operation_mode",
                "latitude",
                "longitude",
                "location",
                "source_file",
                "source_folder",
                "raw_metadata",
            )
            .first()
        )

    def build_file_detail_payload(self, record):
        try:
            import xarray as xr
        except Exception as exc:
            xr = None
            open_error = f"Môi trường hiện tại chưa sẵn sàng cho xarray: {exc}"
        else:
            open_error = None

        candidates = []
        if record.source_file:
            candidates.append(Path(record.source_file))
        if record.source_folder and record.source_file:
            candidates.append(Path(record.source_folder) / Path(record.source_file).name)
        if record.source_folder:
            candidates.append(Path(record.source_folder))
        for root in iter_storage_roots():
            if record.source_file:
                candidates.append(root / record.source_file)
            if record.source_folder:
                candidates.append(root / record.source_folder)
            if record.source_file:
                for suffix in candidate_suffixes(record.source_file):
                    candidates.append(root / suffix)

        source_path = resolve_existing_path(candidates)
        payload = {
            "mission": self.key,
            "mission_label": self.label,
            "detail_type": self.detail_type,
            "record": {
                "sounding_id": record.sounding_id,
                "acquisition_time": record.acquisition_time.isoformat()
                if record.acquisition_time
                else None,
                "xco2": record.xco2,
                "xco2_uncertainty": record.xco2_uncertainty,
                "xco2_quality_flag": record.xco2_quality_flag,
                "orbit": record.orbit,
                "operation_mode": record.operation_mode,
                "latitude": record.latitude,
                "longitude": record.longitude,
                "source_file": record.source_file,
                "source_folder": record.source_folder,
                "raw_metadata": serialize_value(record.raw_metadata, max_length=400),
            },
            "file": {
                "name": Path(record.source_file).name if record.source_file else None,
                "resolved_path": str(source_path) if source_path else None,
                "exists": bool(source_path),
            },
            "dataset": None,
            "dataset_error": open_error,
        }
        if not source_path:
            payload["dataset_error"] = payload["dataset_error"] or "Không tìm thấy tệp .nc4 cho bản ghi này."
            return payload

        try:
            stat_result = source_path.stat()
        except OSError as exc:
            payload["dataset_error"] = f"Không thể đọc thông tin tệp nguồn: {exc}"
            return payload

        payload["file"].update(
            {
                "size_bytes": stat_result.st_size,
                "modified_at": datetime.fromtimestamp(
                    stat_result.st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )
        if xr is None:
            return payload

        last_open_error = None
        for engine in XARRAY_ENGINES:
            try:
                dataset_context = xr.open_dataset(
                    source_path,
                    engine=engine,
                    decode_cf=False,
                    mask_and_scale=False,
                )
            except Exception as exc:
                last_open_error = exc
                continue
            try:
                with dataset_context as dataset:
                    payload["file"]["xarray_engine"] = engine
                    payload["dataset"] = {
                        "dims": [
                            {"name": str(name), "size": int(size)}
                            for name, size in dataset.sizes.items()
                        ],
                        "coordinates": [
                            summarize_data_array(name, data_array)
                            for name, data_array in list(dataset.coords.items())[:25]
                        ],
                        "data_variables": [
                            summarize_data_array(name, data_array)
                            for name, data_array in list(dataset.data_vars.items())[:50]
                        ],
                        "attributes": summarize_attrs(dataset.attrs, limit=25),
                    }
                payload["dataset_error"] = None
                return payload
            except Exception as exc:
                last_open_error = exc
        payload["dataset_error"] = (
            "Không thể mở file .nc4 bằng xarray. "
            f"Đã thử các engine {', '.join(XARRAY_ENGINES)}. Lỗi cuối: {last_open_error}"
        )
        return payload


class GOSAT2MissionAdapter(BaseMissionAdapter):
    key = "gosat2_vn"
    label = "GOSAT-2 Vietnam"
    detail_type = "h5"

    def base_queryset(self):
        return (
            Sounding.objects.select_related(
                "product",
                "retrieval",
                "cloud",
                "l1_quality_summary",
            )
            .filter(geom__isnull=False)
            .filter(geom__intersects=VIETNAM_BOUNDS_POLYGON)
        )

    def apply_spatial_filters(self, queryset, *, bbox=None, geometry=None):
        if geometry is not None:
            return queryset.filter(geom__intersects=geometry)
        if bbox is not None:
            return queryset.filter(geom__intersects=bbox)
        return queryset

    def apply_date_filters(self, queryset, *, date_from=None, date_to=None):
        if date_from:
            queryset = queryset.filter(observation_time__gte=date_from)
        if date_to:
            queryset = queryset.filter(observation_time__lte=date_to)
        return queryset

    def apply_extra_filters(self, queryset, extra_filters):
        if extra_filters.get("product_version"):
            queryset = queryset.filter(
                product__product_version__icontains=extra_filters["product_version"]
            )
        if extra_filters.get("processing_level"):
            queryset = queryset.filter(
                product__processing_level__icontains=extra_filters["processing_level"]
            )
        if extra_filters.get("sensor_name"):
            queryset = queryset.filter(
                product__sensor_name__icontains=extra_filters["sensor_name"]
            )
        if extra_filters.get("file_id"):
            queryset = queryset.filter(product__file_id__icontains=extra_filters["file_id"])
        if extra_filters.get("file_name"):
            queryset = queryset.filter(
                Q(product__file_name__icontains=extra_filters["file_name"])
                | Q(product__file_path__icontains=extra_filters["file_name"])
            )
        return queryset

    def serialize_features(self, records):
        return [serialize_gosat_feature(record) for record in records]

    def get_overview(self):
        cache_key = "carbon_tracker:overview:gosat2_vn"
        overview = cache.get(cache_key)
        if overview is None:
            first_observation_time = (
                self.base_queryset()
                .order_by("observation_time")
                .values_list("observation_time", flat=True)
                .first()
            )
            latest_observation_time = (
                self.base_queryset()
                .order_by("-observation_time")
                .values_list("observation_time", flat=True)
                .first()
            )
            overview = {
                "total_records": self.base_queryset().count(),
                "first_acquisition_time": first_observation_time,
                "latest_acquisition_time": latest_observation_time,
            }
            cache.set(cache_key, overview, timeout=60 * 10)
        return overview

    def build_report_payload(self, query_context, granularity):
        queryset = query_context.queryset
        summary = queryset.aggregate(
            total_records=Count("id"),
            xco2_avg=Avg("retrieval__xco2"),
            xco2_min=Min("retrieval__xco2"),
            xco2_max=Max("retrieval__xco2"),
            xco2_stddev=StdDev("retrieval__xco2"),
            uncertainty_avg=Avg("retrieval__xco2_uncert"),
            uncertainty_max=Max("retrieval__xco2_uncert"),
            first_acquisition_time=Min("observation_time"),
            latest_acquisition_time=Max("observation_time"),
            unique_source_files=Count("product__file_name", distinct=True),
            unique_products=Count("product", distinct=True),
            unique_product_versions=Count("product__product_version", distinct=True),
            unique_processing_levels=Count("product__processing_level", distinct=True),
            unique_sensors=Count("product__sensor_name", distinct=True),
            latitude_min=Min("latitude"),
            latitude_max=Max("latitude"),
            longitude_min=Min("longitude"),
            longitude_max=Max("longitude"),
            retrieval_known_count=Count("id", filter=Q(retrieval__isnull=False)),
            xco2_known_count=Count("id", filter=Q(retrieval__xco2__isnull=False)),
            uncertainty_known_count=Count("id", filter=Q(retrieval__xco2_uncert__isnull=False)),
            quality_known_count=Count("id", filter=Q(retrieval__xco2_quality_flag__isnull=False)),
            quality_good_count=Count("id", filter=Q(retrieval__xco2_quality_flag=QUALITY_GOOD_FLAG)),
            cloud_known_count=Count("id", filter=Q(cloud__isnull=False)),
            l1_known_count=Count("id", filter=Q(l1_quality_summary__isnull=False)),
        )
        summary["active_days"] = (
            queryset.annotate(day=TruncDay("observation_time")).values("day").distinct().count()
        )
        total_records = summary.get("total_records") or 0
        for label in (
            "retrieval",
            "xco2",
            "uncertainty",
            "quality",
            "cloud",
            "l1",
        ):
            count = summary.get(f"{label}_known_count") or 0
            summary[f"{label}_known_ratio"] = (count / total_records) * 100 if total_records else None
        quality_known_count = summary.get("quality_known_count") or 0
        summary["quality_good_ratio"] = (
            ((summary.get("quality_good_count") or 0) / quality_known_count) * 100
            if quality_known_count
            else None
        )

        top_sources_rows = (
            queryset.values(
                "product__file_name",
                "product__file_id",
                "product__product_version",
                "product__processing_level",
            )
            .annotate(
                count=Count("id"),
                xco2_avg=Avg("retrieval__xco2"),
                uncertainty_avg=Avg("retrieval__xco2_uncert"),
            )
            .order_by("-count", "product__file_name")[:TOP_LIMIT]
        )
        secondary_items_rows = (
            queryset.values("product__processing_level")
            .annotate(
                count=Count("id"),
                xco2_avg=Avg("retrieval__xco2"),
                uncertainty_avg=Avg("retrieval__xco2_uncert"),
            )
            .order_by("-count", "product__processing_level")[:TOP_LIMIT]
        )
        sensor_rows = (
            queryset.values("product__sensor_name")
            .annotate(count=Count("id"), xco2_avg=Avg("retrieval__xco2"))
            .order_by("-count", "product__sensor_name")[:TOP_LIMIT]
        )
        mode_rows = (
            queryset.exclude(detailed_operation_mode__isnull=True)
            .exclude(detailed_operation_mode="")
            .annotate(mode_label=Coalesce("detailed_operation_mode", Value(""), output_field=CharField()))
            .values("mode_label")
            .annotate(count=Count("id"), xco2_avg=Avg("retrieval__xco2"))
            .order_by("-count", "mode_label")[:TOP_LIMIT]
        )

        return {
            "mission": self.key,
            "mission_label": self.label,
            "detail_type": self.detail_type,
            "filters": query_context.metadata(),
            "summary": summary,
            "timeseries": build_timeseries(
                queryset,
                date_field="observation_time",
                count_field="id",
                xco2_field="retrieval__xco2",
                uncertainty_field="retrieval__xco2_uncert",
                quality_field="retrieval__xco2_quality_flag",
                granularity=granularity,
            ),
            "histogram": build_histogram(queryset, "retrieval__xco2"),
            "top_days": build_top_days(
                queryset,
                date_field="observation_time",
                count_field="id",
                xco2_field="retrieval__xco2",
                uncertainty_field="retrieval__xco2_uncert",
            ),
            "top_sources": [
                {
                    "label": row["product__file_name"] or row["product__file_id"] or "Không xác định",
                    "count": row["count"],
                    "xco2_avg": row["xco2_avg"],
                    "uncertainty_avg": row["uncertainty_avg"],
                    "file_name": row["product__file_name"],
                    "file_id": row["product__file_id"],
                    "product_version": row["product__product_version"],
                    "processing_level": row["product__processing_level"],
                }
                for row in top_sources_rows
            ],
            "secondary_items": [
                {
                    "label": row["product__processing_level"] or "Không xác định",
                    "count": row["count"],
                    "xco2_avg": row["xco2_avg"],
                    "uncertainty_avg": row["uncertainty_avg"],
                    "type": "processing_level",
                }
                for row in secondary_items_rows
            ],
            "quality_breakdown": build_quality_breakdown(
                queryset,
                "retrieval__xco2_quality_flag",
                "id",
            ),
            "data_completeness": [
                {
                    "label": "Có retrieval",
                    "count": summary.get("retrieval_known_count") or 0,
                    "ratio": summary.get("retrieval_known_ratio"),
                },
                {
                    "label": "Có XCO2",
                    "count": summary.get("xco2_known_count") or 0,
                    "ratio": summary.get("xco2_known_ratio"),
                },
                {
                    "label": "Có uncertainty",
                    "count": summary.get("uncertainty_known_count") or 0,
                    "ratio": summary.get("uncertainty_known_ratio"),
                },
                {
                    "label": "Có quality flag",
                    "count": summary.get("quality_known_count") or 0,
                    "ratio": summary.get("quality_known_ratio"),
                },
                {
                    "label": "Có Cloud info",
                    "count": summary.get("cloud_known_count") or 0,
                    "ratio": summary.get("cloud_known_ratio"),
                },
                {
                    "label": "Có L1 quality",
                    "count": summary.get("l1_known_count") or 0,
                    "ratio": summary.get("l1_known_ratio"),
                },
            ],
            "insights": {
                "dominant_source": (
                    {
                        "label": (
                            top_sources_rows[0]["product__file_name"]
                            or top_sources_rows[0]["product__file_id"]
                            or "Không xác định"
                        ),
                        "count": top_sources_rows[0]["count"],
                    }
                    if top_sources_rows
                    else None
                ),
                "secondary_focus": (
                    {
                        "label": secondary_items_rows[0]["product__processing_level"] or "Không xác định",
                        "count": secondary_items_rows[0]["count"],
                    }
                    if secondary_items_rows
                    else None
                ),
                "sensors": [
                    {
                        "label": row["product__sensor_name"] or "Không xác định",
                        "count": row["count"],
                        "xco2_avg": row["xco2_avg"],
                    }
                    for row in sensor_rows
                ],
                "operation_modes": [
                    {
                        "label": row["mode_label"] or "Không xác định",
                        "count": row["count"],
                        "xco2_avg": row["xco2_avg"],
                    }
                    for row in mode_rows
                ],
            },
            "ui_context": {
                "source_chart_title": "Product / file chi phối",
                "secondary_title": "Processing level nổi bật",
                "secondary_empty": "Chưa có processing level",
                "table_variant": "gosat2",
            },
        }

    def get_record(self, record_key):
        queryset = self.base_queryset()
        if str(record_key).isdigit():
            record = queryset.filter(pk=int(record_key)).first()
            if record is not None:
                return record
        return queryset.filter(sounding_unique_id=record_key).first()

    def build_file_detail_payload(self, record):
        product = record.product
        retrieval = getattr(record, "retrieval", None)
        cloud = getattr(record, "cloud", None)
        l1_summary = getattr(record, "l1_quality_summary", None)

        candidates = []
        if product.file_path:
            candidates.append(Path(product.file_path))
            for suffix in candidate_suffixes(product.file_path):
                for root in iter_storage_roots():
                    candidates.append(root / suffix)
        if product.file_name:
            candidates.append(Path(product.file_name))
            for root in iter_storage_roots():
                candidates.append(root / product.file_name)
        source_path = resolve_existing_path(candidates)

        payload = {
            "mission": self.key,
            "mission_label": self.label,
            "detail_type": self.detail_type,
            "record": {
                "record_id": record.pk,
                "display_id": record.sounding_unique_id or f"Sounding {record.pk}",
                "sounding_unique_id": record.sounding_unique_id,
                "observation_request_id": record.observation_request_id,
                "observation_time": record.observation_time.isoformat()
                if record.observation_time
                else None,
                "latitude": record.latitude,
                "longitude": record.longitude,
                "height": record.height,
                "operation_mode": record.detailed_operation_mode,
                "sunglint_flag": record.sunglint_flag,
                "solar_zenith": record.solar_zenith,
                "view_zenith": record.view_zenith,
            },
            "product": {
                "product_id": product.pk,
                "file_name": product.file_name,
                "file_path": product.file_path,
                "file_id": product.file_id,
                "satellite_name": product.satellite_name,
                "sensor_name": product.sensor_name,
                "processing_level": product.processing_level,
                "product_version": product.product_version,
                "algorithm_name": product.algorithm_name,
                "algorithm_version": product.algorithm_version,
                "input_data_version": product.input_data_version,
                "start_date": product.start_date.isoformat() if product.start_date else None,
                "end_date": product.end_date.isoformat() if product.end_date else None,
                "processing_date": product.processing_date.isoformat()
                if product.processing_date
                else None,
                "num_sounding": product.num_sounding,
                "num_layer": product.num_layer,
                "num_band": product.num_band,
                "metadata_json": serialize_value(product.metadata_json, max_length=400),
            },
            "retrieval": {
                "xco2": getattr(retrieval, "xco2", None),
                "xco2_uncertainty": getattr(retrieval, "xco2_uncert", None),
                "xco2_quality_flag": getattr(retrieval, "xco2_quality_flag", None),
                "xch4": getattr(retrieval, "xch4", None),
                "xco": getattr(retrieval, "xco", None),
                "xh2o": getattr(retrieval, "xh2o", None),
                "surface_pressure": getattr(retrieval, "surface_pressure", None),
                "wind_speed": getattr(retrieval, "wind_speed", None),
                "iteration": getattr(retrieval, "iteration", None),
            },
            "quality": {
                "cloud_information": {
                    "co2_ratio": getattr(cloud, "co2_ratio", None),
                    "ch4_ratio": getattr(cloud, "ch4_ratio", None),
                    "h2o_ratio": getattr(cloud, "h2o_ratio", None),
                    "surface_pressure_delta": getattr(cloud, "surface_pressure_delta", None),
                    "fts2_2um_flag_1": getattr(cloud, "fts2_2um_flag_1", None),
                    "fts2_2um_flag_2": getattr(cloud, "fts2_2um_flag_2", None),
                    "fts2_tir_flag_1": getattr(cloud, "fts2_tir_flag_1", None),
                    "fts2_tir_flag_2": getattr(cloud, "fts2_tir_flag_2", None),
                    "fts2_tir_flag_3": getattr(cloud, "fts2_tir_flag_3", None),
                },
                "l1_quality_summary": {
                    "sounding_quality_flag": getattr(l1_summary, "sounding_quality_flag", None),
                    "scan_stability_flag": getattr(l1_summary, "scan_stability_flag", None),
                    "imc_stability_flag": getattr(l1_summary, "imc_stability_flag", None),
                },
                "related_counts": {
                    "cloud_present": CloudInformation.objects.filter(sounding=record).exists(),
                    "l1_summary_present": L1QualitySummary.objects.filter(sounding=record).exists(),
                    "catalog_count": H5DatasetCatalog.objects.filter(product=product).count(),
                },
            },
            "catalog": {
                "count": H5DatasetCatalog.objects.filter(product=product).count(),
                "items": [
                    {
                        "h5_path": item.h5_path,
                        "dataset_name": item.dataset_name,
                        "h5_group": item.h5_group,
                        "shape": item.shape,
                        "dtype": item.dtype,
                        "description": item.description,
                        "unit": item.unit,
                    }
                    for item in H5DatasetCatalog.objects.filter(product=product)
                    .order_by("h5_group", "dataset_name")[:40]
                ],
            },
            "file": {
                "name": product.file_name,
                "resolved_path": str(source_path) if source_path else None,
                "exists": bool(source_path),
            },
            "h5_preview": None,
            "dataset_error": None,
        }

        if source_path:
            try:
                stat_result = source_path.stat()
            except OSError as exc:
                payload["dataset_error"] = f"Không thể đọc thông tin file H5: {exc}"
            else:
                payload["file"].update(
                    {
                        "size_bytes": stat_result.st_size,
                        "modified_at": datetime.fromtimestamp(
                            stat_result.st_mtime, tz=timezone.utc
                        ).isoformat(),
                    }
                )
                try:
                    import h5py
                except Exception as exc:
                    payload["dataset_error"] = f"Môi trường hiện tại chưa sẵn sàng cho h5py: {exc}"
                else:
                    try:
                        with h5py.File(source_path, "r") as h5:
                            top_level = []
                            for name, item in list(h5.items())[:20]:
                                if isinstance(item, h5py.Group):
                                    item_type = "group"
                                    shape = None
                                else:
                                    item_type = "dataset"
                                    shape = str(getattr(item, "shape", ""))
                                top_level.append(
                                    {
                                        "name": name,
                                        "type": item_type,
                                        "shape": shape,
                                    }
                                )
                            payload["h5_preview"] = {
                                "top_level_items": top_level,
                                "attributes": summarize_attrs(h5.attrs, limit=20),
                            }
                    except Exception as exc:
                        payload["dataset_error"] = f"Không thể mở file H5: {exc}"
        else:
            payload["dataset_error"] = "Không tìm thấy file H5 trên máy chủ. Vẫn hiển thị metadata đã import."

        return payload


MISSION_ADAPTERS = {
    "oco2_vn": OCO2MissionAdapter(),
    "gosat2_vn": GOSAT2MissionAdapter(),
}


def get_mission_adapter(mission_key):
    return MISSION_ADAPTERS[mission_key]


def get_mission_switcher_payload():
    payload = {
        "default_mission": "oco2_vn",
        "missions": [adapter.ui_payload() for adapter in MISSION_ADAPTERS.values()],
        "overviews": {},
        "vietnam_bounds": VIETNAM_DEFAULT_BOUNDS,
    }
    for key, adapter in MISSION_ADAPTERS.items():
        overview = adapter.get_overview()
        latest = overview.get("latest_acquisition_time")
        payload["overviews"][key] = {
            "total_records": overview.get("total_records") or 0,
            "first_acquisition_time": overview.get("first_acquisition_time").isoformat()
            if overview.get("first_acquisition_time")
            else None,
            "latest_acquisition_time": latest.isoformat() if latest else None,
            "latest_date_value": latest.date().isoformat() if latest else "",
        }
    return payload
