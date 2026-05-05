from django.shortcuts import render
from django.views import View
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .missions import get_mission_adapter, get_mission_switcher_payload
from .query import (
    build_query_context,
    parse_geojson_geometry,
    parse_granularity,
    parse_mission,
    parse_page_params,
)


class CarbonTrackerViewIndex(View):
    def get(self, request):
        mission_payload = get_mission_switcher_payload()
        default_overview = mission_payload["overviews"][mission_payload["default_mission"]]
        context = {
            "total_records": default_overview.get("total_records") or 0,
            "latest_date_value": default_overview.get("latest_date_value") or "",
            "mission_payload": mission_payload,
        }
        return render(request, "carbon_tracker/index.html", context)


class CarbonTrackerDataListAPIView(APIView):
    def get(self, request):
        mission = parse_mission(request.query_params)
        adapter = get_mission_adapter(mission)
        page, page_size = parse_page_params(request.query_params)
        query_context = build_query_context(adapter, request.query_params, require_bbox=True)
        ordering = (
            "-acquisition_time",
            "-sounding_id",
        ) if mission == "oco2_vn" else ("-observation_time", "-id")
        queryset = query_context.queryset.order_by(*ordering)
        total = queryset.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        offset = (page - 1) * page_size
        records = list(queryset[offset : offset + page_size])
        geojson = {
            "type": "FeatureCollection",
            "features": adapter.serialize_features(records),
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "filters": query_context.metadata(),
            "mission": adapter.key,
            "mission_label": adapter.label,
        }
        return Response(geojson)


class CarbonTrackerSummaryAPIView(APIView):
    def get(self, request):
        mission = parse_mission(request.query_params)
        adapter = get_mission_adapter(mission)
        granularity = parse_granularity(request.query_params)
        query_context = build_query_context(adapter, request.query_params, require_bbox=True)
        return Response(adapter.build_report_payload(query_context, granularity))


class CarbonTrackerTimeseriesAPIView(APIView):
    def get(self, request):
        mission = parse_mission(request.query_params)
        adapter = get_mission_adapter(mission)
        granularity = parse_granularity(request.query_params)
        query_context = build_query_context(adapter, request.query_params, require_bbox=True)
        payload = adapter.build_report_payload(query_context, granularity)
        return Response(
            {
                "mission": adapter.key,
                "mission_label": adapter.label,
                "filters": payload["filters"],
                "granularity": granularity,
                "timeseries": payload["timeseries"],
            }
        )


class CarbonTrackerAOISummaryAPIView(APIView):
    def post(self, request):
        mission = parse_mission(request.query_params)
        adapter = get_mission_adapter(mission)
        granularity = parse_granularity(request.query_params)
        geometry = parse_geojson_geometry(request.data)
        params = request.query_params.copy()
        for key in ("date_from", "date_to", "product_version", "processing_level", "sensor_name", "file_id", "file_name"):
            if key in request.data:
                params[key] = request.data[key]
        query_context = build_query_context(adapter, params, geometry=geometry, require_bbox=False)
        return Response(adapter.build_report_payload(query_context, granularity))


class CarbonTrackerFileDetailAPIView(APIView):
    def get(self, request, record_key):
        mission = parse_mission(request.query_params)
        adapter = get_mission_adapter(mission)
        record = adapter.get_record(record_key)
        if record is None:
            raise NotFound("Không tìm thấy bản ghi dữ liệu.")
        return Response(adapter.build_file_detail_payload(record))
