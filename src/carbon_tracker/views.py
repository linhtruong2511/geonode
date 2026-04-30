from django.core.cache import cache
from django.db import connection
from django.views import View
from django.shortcuts import render
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OCO2Data
from .query import (
    build_query_context,
    build_report_payload,
    parse_geojson_geometry,
    parse_granularity,
    parse_page_params,
)
from .serializers import OCO2DataSerializer


def get_table_row_estimate():
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(reltuples, 0)::bigint
                FROM pg_class
                WHERE oid = %s::regclass
                """,
                [OCO2Data._meta.db_table],
            )
            row = cursor.fetchone()
    except Exception:
        return OCO2Data.objects.count()
    return max(int(row[0] if row else 0), 0)


class CarbonTrackerViewIndex(View):
    def get(self, request):
        overview = cache.get("carbon_tracker_overview")
        if overview is None:
            first_acquisition_time = (
                OCO2Data.objects.order_by("acquisition_time")
                .values_list("acquisition_time", flat=True)
                .first()
            )
            latest_acquisition_time = (
                OCO2Data.objects.order_by("-acquisition_time")
                .values_list("acquisition_time", flat=True)
                .first()
            )
            overview = {
                "total_records": get_table_row_estimate(),
                "first_acquisition_time": first_acquisition_time,
                "latest_acquisition_time": latest_acquisition_time,
            }
            cache.set("carbon_tracker_overview", overview, timeout=60 * 10)

        latest = overview.get("latest_acquisition_time")
        context = {
            "total_records": overview.get("total_records") or 0,
            "first_acquisition_time": overview.get("first_acquisition_time"),
            "latest_acquisition_time": latest,
            "latest_date_value": latest.date().isoformat() if latest else "",
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

        serialized = OCO2DataSerializer(records, many=True).data
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
