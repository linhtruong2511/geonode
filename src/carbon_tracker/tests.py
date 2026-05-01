import json
import tempfile
from datetime import datetime
from pathlib import Path
from unittest import skipUnless

from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import VietNamOCO2Data

try:
    import xarray as xr
except Exception:  # pragma: no cover - depends on environment
    xr = None


@override_settings(ALLOWED_HOSTS=["testserver", "localhost"])
class CarbonTrackerAPITests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.nc4_path = self.temp_path / "vietnam_oco2_sample.nc4"
        if xr is not None:
            dataset = xr.Dataset(
                data_vars={
                    "xco2": (("sounding",), [410.0, 420.0, 430.0]),
                    "xco2_uncertainty": (("sounding",), [0.8, 0.9, 1.1]),
                },
                coords={
                    "sounding": [1001, 1002, 1003],
                    "latitude": (("sounding",), [16.57, 16.58, 16.85]),
                    "longitude": (("sounding",), [106.70, 106.71, 106.95]),
                },
                attrs={"mission": "OCO-2", "region": "Vietnam"},
            )
            dataset.to_netcdf(self.nc4_path)

        self.record_a = VietNamOCO2Data.objects.create(
            sounding_id=1001,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 1, 9, 0)),
            xco2=410.0,
            xco2_uncertainty=0.8,
            xco2_quality_flag=0,
            latitude=16.57,
            longitude=106.70,
            location=Point(106.70, 16.57, srid=4326),
            orbit=11,
            operation_mode="Nadir",
            source_file=str(self.nc4_path),
            source_folder=str(self.temp_path),
            raw_metadata={"processor": "test-a"},
        )
        self.record_b = VietNamOCO2Data.objects.create(
            sounding_id=1002,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 2, 9, 0)),
            xco2=420.0,
            xco2_uncertainty=0.9,
            xco2_quality_flag=1,
            latitude=16.58,
            longitude=106.71,
            location=Point(106.71, 16.58, srid=4326),
            orbit=11,
            operation_mode="Target",
            source_file=str(self.nc4_path),
            source_folder=str(self.temp_path),
            raw_metadata={"processor": "test-b"},
        )
        self.record_c = VietNamOCO2Data.objects.create(
            sounding_id=1003,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 3, 9, 0)),
            xco2=430.0,
            xco2_uncertainty=1.1,
            xco2_quality_flag=0,
            latitude=16.85,
            longitude=106.95,
            location=Point(106.95, 16.85, srid=4326),
            orbit=12,
            operation_mode="Nadir",
            source_file=str(self.nc4_path),
            source_folder=str(self.temp_path),
            raw_metadata={"processor": "test-c"},
        )
        VietNamOCO2Data.objects.create(
            sounding_id=1004,
            acquisition_time=timezone.make_aware(datetime(2026, 1, 4, 9, 0)),
            xco2=450.0,
            xco2_uncertainty=1.4,
            xco2_quality_flag=2,
            latitude=18.00,
            longitude=108.00,
            location=Point(108.0, 18.0, srid=4326),
            orbit=20,
            operation_mode="Glint",
            source_file="other_file.nc4",
            source_folder="D:/unavailable",
            raw_metadata={"processor": "test-d"},
        )

    def tearDown(self):
        self.temp_dir.cleanup()

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
        self.assertIn("source_file", payload["features"][0]["properties"])
        self.assertIn("xco2_uncertainty", payload["features"][0]["properties"])

    def test_carbon_points_api_rejects_missing_or_invalid_filters(self):
        missing_response = self.client.get(reverse("carbon_tracker:api_data"))
        self.assertEqual(missing_response.status_code, 400)

        invalid_date_response = self.client.get(
            reverse("carbon_tracker:api_data"),
            self.bbox_params(date_from="2026-01-10", date_to="2026-01-01"),
        )
        self.assertEqual(invalid_date_response.status_code, 400)

    def test_summary_api_returns_vietnam_focused_statistics(self):
        response = self.client.get(reverse("carbon_tracker:summary"), self.bbox_params())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        summary = payload["summary"]
        self.assertEqual(summary["total_records"], 3)
        self.assertEqual(summary["active_days"], 3)
        self.assertAlmostEqual(summary["xco2_avg"], 420.0)
        self.assertAlmostEqual(summary["uncertainty_avg"], 0.9333333333, places=3)
        self.assertEqual(summary["quality_good_count"], 2)
        self.assertEqual(summary["quality_known_count"], 3)
        self.assertAlmostEqual(summary["quality_good_ratio"], 66.6666, places=2)
        self.assertEqual(summary["unique_source_files"], 1)
        self.assertEqual(summary["unique_operation_modes"], 2)
        self.assertEqual(len(payload["histogram"]["labels"]), 10)
        self.assertTrue(payload["top_days"])
        self.assertTrue(payload["top_sources"])
        self.assertTrue(payload["operation_modes"])
        self.assertTrue(payload["quality_breakdown"])
        self.assertTrue(payload["top_orbits"])

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
        self.assertIn("uncertainty_avg", payload["timeseries"][0])

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

    @skipUnless(xr is not None, "xarray is not installed")
    def test_file_detail_endpoint_reads_nc4_metadata(self):
        response = self.client.get(
            reverse("carbon_tracker:file_detail", kwargs={"sounding_id": self.record_a.sounding_id})
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["record"]["sounding_id"], self.record_a.sounding_id)
        self.assertEqual(payload["file"]["name"], self.nc4_path.name)
        self.assertTrue(payload["dataset"]["dims"])
        self.assertTrue(payload["dataset"]["data_variables"])
        self.assertTrue(payload["dataset"]["attributes"])

    def test_index_page_renders_vietnam_workbench(self):
        response = self.client.get(reverse("carbon_tracker:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Carbon Tracker Vietnam")
        self.assertContains(response, "ct-refresh")
