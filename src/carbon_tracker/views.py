from datetime import datetime, timezone
from pathlib import Path
import os

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.shortcuts import render
from django.views import View
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import VietNamOCO2Data
from .query import (
    build_query_context,
    build_report_payload,
    parse_geojson_geometry,
    parse_granularity,
    parse_page_params,
)
from .serializers import VietNamOCO2DataSerializer

VIETNAM_DEFAULT_BOUNDS = [8.18, 102.14, 23.39, 109.47]
DEFAULT_STORAGE_ROOTS = [
    "/data/oco2_storage",
    "D:/Work/Truong_Teacher/DATA",
]
XARRAY_ENGINES = ("h5netcdf", "netcdf4")


def get_table_row_estimate():
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(reltuples, 0)::bigint
                FROM pg_class
                WHERE oid = %s::regclass
                """,
                [VietNamOCO2Data._meta.db_table],
            )
            row = cursor.fetchone()
    except Exception:
        return VietNamOCO2Data.objects.count()
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


def iter_storage_roots(local_root=None, configured_base_dir=None):
    configured_roots = list(getattr(settings, "CARBON_TRACKER_STORAGE_ROOTS", []) or [])
    project_roots = [
        configured_base_dir,
        local_root,
        Path(local_root).parent if local_root else None,
        os.getcwd(),
    ]
    seen = set()
    for raw_path in configured_roots + DEFAULT_STORAGE_ROOTS + project_roots:
        if not raw_path:
            continue
        root_path = Path(raw_path)
        normalized_key = str(root_path)
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        yield root_path


def resolve_source_file_path(record):
    candidates = []
    source_file = (record.source_file or "").strip()
    source_folder = (record.source_folder or "").strip()
    local_root = getattr(settings, "LOCAL_ROOT", None)
    configured_base_dir = getattr(settings, "BASE_DIR", None)
    storage_roots = list(iter_storage_roots(local_root, configured_base_dir))

    if source_file:
        file_path = Path(source_file)
        candidates.append(file_path)
        if source_folder:
            candidates.append(Path(source_folder) / file_path.name)
            candidates.append(Path(source_folder) / source_file)

    if source_folder:
        folder_path = Path(source_folder)
        candidates.append(folder_path)

    for root_path in storage_roots:
        if source_file:
            candidates.append(root_path / source_file)
        if source_folder:
            candidates.append(root_path / source_folder)
            if source_file:
                candidates.append(root_path / source_folder / Path(source_file).name)

    checked = set()
    for candidate in candidates:
        try:
            normalized = candidate.expanduser().resolve(strict=False)
        except Exception:
            normalized = candidate
        normalized_key = str(normalized)
        if normalized_key in checked:
            continue
        checked.add(normalized_key)
        if normalized.is_file():
            return normalized

    raise NotFound("Khong tim thay tep .nc4 cho ban ghi nay.")


def build_file_detail_payload(record):
    source_path = resolve_source_file_path(record)
    try:
        stat_result = source_path.stat()
    except OSError as exc:
        raise NotFound(f"Khong the doc thong tin tep nguon: {exc}")
    cache_key = (
        f"carbon_tracker:file-detail:{record.sounding_id}:{source_path}:{int(stat_result.st_mtime)}"
    )
    cached_payload = cache.get(cache_key)
    if cached_payload is not None:
        return cached_payload

    try:
        import xarray as xr
    except Exception as exc:
        raise NotFound(f"Moi truong hien tai chua san sang cho xarray: {exc}")

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
                payload = {
                    "record": {
                        "sounding_id": record.sounding_id,
                        "acquisition_time": record.acquisition_time.isoformat(),
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
                        "resolved_path": str(source_path),
                        "name": source_path.name,
                        "size_bytes": stat_result.st_size,
                        "modified_at": datetime.fromtimestamp(
                            stat_result.st_mtime, tz=timezone.utc
                        ).isoformat(),
                        "xarray_engine": engine,
                    },
                    "dataset": {
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
                    },
                }
            cache.set(cache_key, payload, timeout=60 * 10)
            return payload
        except Exception as exc:
            last_open_error = exc
            continue
    raise NotFound(
        "Khong the mo file .nc4 bang xarray. "
        f"Da thu cac engine {', '.join(XARRAY_ENGINES)}. Loi cuoi: {last_open_error}"
    )


class CarbonTrackerViewIndex(View):
    def get(self, request):
        overview = cache.get("carbon_tracker_vn_overview")
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
                "total_records": get_table_row_estimate(),
                "first_acquisition_time": first_acquisition_time,
                "latest_acquisition_time": latest_acquisition_time,
            }
            cache.set("carbon_tracker_vn_overview", overview, timeout=60 * 10)

        latest = overview.get("latest_acquisition_time")
        context = {
            "total_records": overview.get("total_records") or 0,
            "first_acquisition_time": overview.get("first_acquisition_time"),
            "latest_acquisition_time": latest,
            "latest_date_value": latest.date().isoformat() if latest else "",
            "vietnam_bounds": ",".join(str(value) for value in VIETNAM_DEFAULT_BOUNDS),
        }
        return render(request, "carbon_tracker/index.html", context)


class CarbonTrackerDataListAPIView(APIView):
    def get(self, request):
        page, page_size = parse_page_params(request.query_params)
        query_context = build_query_context(request.query_params, require_bbox=True)
        queryset = query_context.queryset.order_by("-acquisition_time", "-sounding_id")
        total = queryset.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        offset = (page - 1) * page_size
        records = queryset[offset : offset + page_size]

        serialized = VietNamOCO2DataSerializer(records, many=True).data
        if isinstance(serialized, dict) and serialized.get("type") == "FeatureCollection":
            geojson = dict(serialized)
        else:
            geojson = {"type": "FeatureCollection", "features": serialized}
        geojson.update(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "filters": query_context.metadata(),
            }
        )
        return Response(geojson)


class CarbonTrackerSummaryAPIView(APIView):
    def get(self, request):
        granularity = parse_granularity(request.query_params)
        query_context = build_query_context(request.query_params, require_bbox=True)
        return Response(build_report_payload(query_context, granularity))


class CarbonTrackerTimeseriesAPIView(APIView):
    def get(self, request):
        granularity = parse_granularity(request.query_params)
        query_context = build_query_context(request.query_params, require_bbox=True)
        payload = build_report_payload(query_context, granularity)
        return Response(
            {
                "filters": payload["filters"],
                "granularity": granularity,
                "timeseries": payload["timeseries"],
            }
        )


class CarbonTrackerAOISummaryAPIView(APIView):
    def post(self, request):
        granularity = parse_granularity(request.query_params)
        geometry = parse_geojson_geometry(request.data)
        params = request.query_params.copy()
        for key in ("date_from", "date_to"):
            if key in request.data:
                params[key] = request.data[key]
        query_context = build_query_context(params, geometry=geometry, require_bbox=False)
        return Response(build_report_payload(query_context, granularity))


class CarbonTrackerFileDetailAPIView(APIView):
    def get(self, request, sounding_id):
        record = (
            VietNamOCO2Data.objects.filter(sounding_id=sounding_id)
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
                "source_file",
                "source_folder",
                "raw_metadata",
            )
            .first()
        )
        if record is None:
            raise NotFound("Khong tim thay ban ghi du lieu.")
        return Response(build_file_detail_payload(record))
