import json
import tempfile
from datetime import datetime
from pathlib import Path
from unittest import skipUnless

from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import (
    CloudInformation,
    GosatProduct,
    H5DatasetCatalog,
    L1QualitySummary,
    RetrievalResult,
    Sounding,
    VietNamOCO2Data,
)

try:
    import h5py
except Exception:  # pragma: no cover - depends on environment
    h5py = None

try:
    import xarray as xr
except Exception:  # pragma: no cover - depends on environment
    xr = None


@override_settings(ALLOWED_HOSTS=["testserver", "localhost"])
class CarbonTrackerMissionAwareAPITests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.nc4_path = self.temp_path / "vietnam_oco2_sample.nc4"
        self.h5_path = self.temp_path / "gosat2_sample.h5"

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

        if h5py is not None:
            with h5py.File(self.h5_path, "w") as h5:
                metadata = h5.create_group("Metadata")
                metadata.attrs["satelliteName"] = "GOSAT-2"
                h5.create_dataset("RetrievalResult/xco2", data=[419.2, 421.1])
                h5.create_dataset("RetrievalResult/xco2_uncert", data=[0.7, 0.8])
                h5.create_group("SoundingAttribute")

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
        VietNamOCO2Data.objects.create(
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
        VietNamOCO2Data.objects.create(
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

        self.gosat_product = GosatProduct.objects.create(
            file_name=self.h5_path.name,
            file_path=str(self.h5_path),
            file_id="GOSAT2-001",
            satellite_name="GOSAT-2",
            sensor_name="FTS-2",
            processing_level="L2",
            product_version="210210",
            algorithm_version="v1",
            start_date=timezone.make_aware(datetime(2026, 2, 1, 0, 0)),
            end_date=timezone.make_aware(datetime(2026, 2, 1, 1, 0)),
            num_sounding=3,
            metadata_json={"source": "unit-test"},
        )
        self.gosat_inside_a = Sounding.objects.create(
            product=self.gosat_product,
            sounding_unique_id="VN-001",
            observation_request_id="REQ-1",
            observation_time=timezone.make_aware(datetime(2026, 2, 1, 10, 0)),
            latitude=16.1,
            longitude=107.8,
            geom=Point(107.8, 16.1, srid=4326),
            detailed_operation_mode="Target",
            sunglint_flag=0,
            solar_zenith=37.5,
            view_zenith=12.1,
        )
        self.gosat_inside_b = Sounding.objects.create(
            product=self.gosat_product,
            sounding_unique_id="VN-002",
            observation_request_id="REQ-2",
            observation_time=timezone.make_aware(datetime(2026, 2, 2, 11, 0)),
            latitude=16.2,
            longitude=107.9,
            geom=Point(107.9, 16.2, srid=4326),
            detailed_operation_mode="Nadir",
            sunglint_flag=1,
        )
        Sounding.objects.create(
            product=self.gosat_product,
            sounding_unique_id="OUT-001",
            observation_request_id="REQ-3",
            observation_time=timezone.make_aware(datetime(2026, 2, 3, 11, 0)),
            latitude=30.0,
            longitude=120.0,
            geom=Point(120.0, 30.0, srid=4326),
            detailed_operation_mode="Target",
            sunglint_flag=1,
        )
        RetrievalResult.objects.create(
            sounding=self.gosat_inside_a,
            xco2=419.2,
            xco2_uncert=0.7,
            xco2_quality_flag=0,
            xch4=1801.1,
            xco=110.2,
            xh2o=2.4,
            surface_pressure=1008.1,
            wind_speed=4.2,
        )
        RetrievalResult.objects.create(
            sounding=self.gosat_inside_b,
            xco2=421.1,
            xco2_uncert=0.8,
            xco2_quality_flag=1,
            xch4=1808.4,
            xco=111.2,
            xh2o=2.5,
            surface_pressure=1007.5,
            wind_speed=3.9,
        )
        CloudInformation.objects.create(
            sounding=self.gosat_inside_a,
            co2_ratio=0.98,
            h2o_ratio=0.94,
            surface_pressure_delta=0.21,
        )
        L1QualitySummary.objects.create(
            sounding=self.gosat_inside_a,
            sounding_quality_flag="GOOD",
            scan_stability_flag=0,
            imc_stability_flag=0,
        )
        H5DatasetCatalog.objects.create(
            product=self.gosat_product,
            h5_path="RetrievalResult/xco2",
            dataset_name="xco2",
            h5_group="RetrievalResult",
            shape="(2,)",
            dtype="float64",
            unit="ppm",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def bbox_params(self, mission="oco2_vn", **extra):
        params = {
            "mission": mission,
            "sw_lat": "16.0",
            "sw_lng": "106.0",
            "ne_lat": "17.0",
            "ne_lng": "108.5",
        }
        params.update(extra)
        return params

    def test_oco2_points_api_returns_geojson_with_mission_metadata(self):
        response = self.client.get(
            reverse("carbon_tracker:api_data"),
            self.bbox_params(mission="oco2_vn", page_size="1"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(payload["mission"], "oco2_vn")
        self.assertEqual(payload["count"], 3)
        self.assertEqual(payload["page_size"], 1)
        self.assertEqual(payload["total_pages"], 3)
        self.assertIn("source_file", payload["features"][0]["properties"])

    def test_gosat_points_api_returns_soundings_only_in_vietnam(self):
        response = self.client.get(
            reverse("carbon_tracker:api_data"),
            self.bbox_params(mission="gosat2_vn", page_size="10"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mission"], "gosat2_vn")
        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["features"][0]["properties"]["sensor_name"], "FTS-2")
        self.assertIn("file_name", payload["features"][0]["properties"])

    def test_summary_api_returns_oco2_statistics(self):
        response = self.client.get(reverse("carbon_tracker:summary"), self.bbox_params(mission="oco2_vn"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mission"], "oco2_vn")
        self.assertEqual(payload["summary"]["total_records"], 3)
        self.assertAlmostEqual(payload["summary"]["xco2_avg"], 420.0)
        self.assertTrue(payload["top_sources"])
        self.assertTrue(payload["secondary_items"])

    def test_summary_api_returns_gosat_statistics_and_completeness(self):
        response = self.client.get(
            reverse("carbon_tracker:summary"),
            self.bbox_params(mission="gosat2_vn", product_version="210210"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        summary = payload["summary"]
        self.assertEqual(payload["mission"], "gosat2_vn")
        self.assertEqual(summary["total_records"], 2)
        self.assertAlmostEqual(summary["xco2_avg"], 420.15, places=2)
        self.assertEqual(summary["retrieval_known_count"], 2)
        self.assertEqual(len(payload["data_completeness"]), 6)
        self.assertTrue(payload["top_sources"])
        self.assertEqual(payload["ui_context"]["table_variant"], "gosat2")

    def test_timeseries_api_groups_by_day_for_gosat(self):
        response = self.client.get(
            reverse("carbon_tracker:timeseries"),
            self.bbox_params(mission="gosat2_vn", granularity="day"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mission"], "gosat2_vn")
        self.assertEqual(payload["granularity"], "day")
        self.assertEqual(len(payload["timeseries"]), 2)

    def test_aoi_summary_uses_polygon_geometry_for_gosat(self):
        polygon = {
            "type": "Polygon",
            "coordinates": [[
                [107.75, 16.05],
                [107.95, 16.05],
                [107.95, 16.25],
                [107.75, 16.25],
                [107.75, 16.05],
            ]],
        }
        response = self.client.post(
            reverse("carbon_tracker:aoi_summary") + "?mission=gosat2_vn",
            data=json.dumps(polygon),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_records"], 2)
        self.assertAlmostEqual(payload["summary"]["xco2_avg"], 420.15, places=2)

    @skipUnless(xr is not None, "xarray is not installed")
    def test_oco2_file_detail_endpoint_reads_nc4_metadata(self):
        response = self.client.get(
            reverse("carbon_tracker:file_detail", kwargs={"record_key": self.record_a.sounding_id}) +
            "?mission=oco2_vn"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mission"], "oco2_vn")
        self.assertEqual(payload["record"]["sounding_id"], self.record_a.sounding_id)
        self.assertTrue(payload["file"]["exists"])
        self.assertTrue(payload["dataset"]["data_variables"])

    @skipUnless(h5py is not None, "h5py is not installed")
    def test_gosat_file_detail_endpoint_returns_h5_context(self):
        response = self.client.get(
            reverse("carbon_tracker:file_detail", kwargs={"record_key": self.gosat_inside_a.pk}) +
            "?mission=gosat2_vn"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mission"], "gosat2_vn")
        self.assertEqual(payload["record"]["sounding_unique_id"], "VN-001")
        self.assertEqual(payload["product"]["file_id"], "GOSAT2-001")
        self.assertEqual(payload["catalog"]["count"], 1)
        self.assertTrue(payload["file"]["exists"])

    def test_index_page_renders_mission_switcher(self):
        response = self.client.get(reverse("carbon_tracker:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "OCO-2 Vietnam")
        self.assertContains(response, "GOSAT-2 Vietnam")
        self.assertContains(response, "ct-mission-switcher")
