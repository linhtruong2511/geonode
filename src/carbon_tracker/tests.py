import json
from datetime import datetime

from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import OCO2Data


@override_settings(ALLOWED_HOSTS=["testserver", "localhost"])
class CarbonTrackerAPITests(TestCase):
    def setUp(self):
        self.record_a = OCO2Data.objects.create(
            sounding_id=1001,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 1, 9, 0)),
            xco2=410.0,
            location=Point(106.70, 16.57, srid=4326),
            file_path="oco2_a.nc4",
        )
        self.record_b = OCO2Data.objects.create(
            sounding_id=1002,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 2, 9, 0)),
            xco2=420.0,
            location=Point(106.71, 16.58, srid=4326),
            file_path="oco2_a.nc4",
        )
        self.record_c = OCO2Data.objects.create(
            sounding_id=1003,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 3, 9, 0)),
            xco2=430.0,
            location=Point(106.95, 16.85, srid=4326),
            file_path="oco2_b.nc4",
        )
        OCO2Data.objects.create(
            sounding_id=1004,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 4, 9, 0)),
            xco2=450.0,
            location=Point(108.0, 18.0, srid=4326),
            file_path="oco2_c.nc4",
        )

    def bbox_params(self, **extra):
        params = {
            "sw_lat": "16.0",
            "sw_lng": "106.0",
            "ne_lat": "17.0",
            "ne_lng": "107.5",
        }
        params.update(extra)
        return params

    def test_carbon_points_api_returns_geojson_with_pagination_metadata(self):
        response = self.client.get(
            reverse("carbon_tracker:api_data"),
            self.bbox_params(page_size="1", date_from="2026-01-01", date_to="2026-01-02"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertIn("features", payload)
        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["page_size"], 1)
        self.assertEqual(payload["total_pages"], 2)
        self.assertEqual(len(payload["features"]), 1)

    def test_carbon_points_api_rejects_missing_or_invalid_filters(self):
        missing_response = self.client.get(reverse("carbon_tracker:api_data"))
        self.assertEqual(missing_response.status_code, 400)

        invalid_date_response = self.client.get(
            reverse("carbon_tracker:api_data"),
            self.bbox_params(date_from="2026-01-10", date_to="2026-01-01"),
        )
        self.assertEqual(invalid_date_response.status_code, 400)

    def test_summary_api_returns_spatial_and_temporal_statistics(self):
        response = self.client.get(reverse("carbon_tracker:summary"), self.bbox_params())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        summary = payload["summary"]
        self.assertEqual(summary["total_records"], 3)
        self.assertEqual(summary["active_days"], 3)
        self.assertAlmostEqual(summary["xco2_avg"], 420.0)
        self.assertEqual(summary["xco2_min"], 410.0)
        self.assertEqual(summary["xco2_max"], 430.0)
        self.assertEqual(len(payload["histogram"]["labels"]), 10)
        self.assertTrue(payload["top_days"])
        self.assertTrue(payload["top_sources"])

    def test_timeseries_api_groups_by_day(self):
        response = self.client.get(
            reverse("carbon_tracker:timeseries"),
            self.bbox_params(granularity="day"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["granularity"], "day")
        self.assertEqual(len(payload["timeseries"]), 3)
        self.assertEqual(payload["timeseries"][0]["count"], 1)

    def test_aoi_summary_uses_polygon_geometry(self):
        polygon = {
            "type": "Polygon",
            "coordinates": [[
                [106.69, 16.56],
                [106.72, 16.56],
                [106.72, 16.59],
                [106.69, 16.59],
                [106.69, 16.56],
            ]],
        }
        response = self.client.post(
            reverse("carbon_tracker:aoi_summary"),
            data=json.dumps(polygon),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        summary = response.json()["summary"]
        self.assertEqual(summary["total_records"], 2)
        self.assertAlmostEqual(summary["xco2_avg"], 415.0)

    def test_index_page_renders_workbench(self):
        response = self.client.get(reverse("carbon_tracker:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Carbon Tracker")
        self.assertContains(response, "ct-refresh")
