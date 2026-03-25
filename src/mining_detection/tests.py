from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import (
    CoordinateSystem,
    JobStatus,
    MineralType,
    MiningDetectionJob,
    MiningSite,
    MonitoringRecord,
    Province,
    Violation,
)

User = get_user_model()


class MiningDetectionAccessTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="secret123")

    def test_dashboard_requires_login(self):
        response = self.client.get(reverse("mining_detection:dashboard"))
        self.assertEqual(response.status_code, 302)

    def test_dashboard_renders_for_authenticated_user(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("mining_detection:dashboard"))
        self.assertEqual(response.status_code, 200)


class ReferenceCrudSmokeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="refuser", password="secret123")
        self.client.force_login(self.user)

    def test_can_create_province(self):
        response = self.client.post(
            reverse("mining_detection:reference_provinces_create"),
            data={"code": "QN", "name": "Quang Ninh"},
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Province.objects.filter(code="QN").exists())


class MiningSiteCrudTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="siteuser", password="secret123")
        self.client.force_login(self.user)
        self.mineral_type = MineralType.objects.create(code="stone", name="Stone")
        self.coordinate_system = CoordinateSystem.objects.create(name="WGS84")

    def test_can_create_site_with_boundary_formset(self):
        response = self.client.post(
            reverse("mining_detection:site_create"),
            data={
                "serial_number": 1,
                "name": "Test Mine",
                "mineral_type": self.mineral_type.pk,
                "ward": "",
                "location_description": "Hill area",
                "area_ha": "25.4",
                "estimated_reserve_m3": "10000",
                "planning_zone": "",
                "coordinate_system": self.coordinate_system.pk,
                "status": "planned",
                "notes": "Created in test",
                "boundary_points-TOTAL_FORMS": "3",
                "boundary_points-INITIAL_FORMS": "0",
                "boundary_points-MIN_NUM_FORMS": "0",
                "boundary_points-MAX_NUM_FORMS": "1000",
                "boundary_points-0-point_order": "1",
                "boundary_points-0-x": "",
                "boundary_points-0-y": "",
                "boundary_points-0-latitude": "16.10000000",
                "boundary_points-0-longitude": "107.10000000",
                "boundary_points-1-point_order": "2",
                "boundary_points-1-x": "",
                "boundary_points-1-y": "",
                "boundary_points-1-latitude": "16.20000000",
                "boundary_points-1-longitude": "107.20000000",
                "boundary_points-2-point_order": "3",
                "boundary_points-2-x": "",
                "boundary_points-2-y": "",
                "boundary_points-2-latitude": "16.30000000",
                "boundary_points-2-longitude": "107.05000000",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(MiningSite.objects.filter(name="Test Mine").exists())
        self.assertEqual(MiningSite.objects.get(name="Test Mine").boundary_points.count(), 3)


class MonitoringViolationCrudTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="opsuser", password="secret123")
        self.client.force_login(self.user)
        mineral_type = MineralType.objects.create(code="coal", name="Coal")
        self.site = MiningSite.objects.create(
            serial_number=2,
            name="Ops Mine",
            mineral_type=mineral_type,
            area_ha="10.5",
            status="active",
        )

    def test_can_create_monitoring_record_and_violation(self):
        monitoring_response = self.client.post(
            reverse("mining_detection:monitoring_create"),
            data={
                "mining_site": self.site.pk,
                "recorded_at": "2026-03-24T10:00",
                "period_type": "monthly",
                "actual_extraction_m3": "100",
                "remaining_reserve_m3": "900",
                "inspector": "Inspector A",
                "violations_noted": "on",
                "notes": "Inspection notes",
            },
        )
        self.assertEqual(monitoring_response.status_code, 302)
        monitoring = MonitoringRecord.objects.get(mining_site=self.site)

        violation_response = self.client.post(
            reverse("mining_detection:violation_create"),
            data={
                "monitoring_record": monitoring.pk,
                "description": "Exceeded extraction area",
                "severity": "high",
                "status": "open",
                "resolved_at": "",
                "penalty_amount": "1500000",
            },
        )
        self.assertEqual(violation_response.status_code, 302)
        self.assertTrue(Violation.objects.filter(monitoring_record=monitoring).exists())


class JobCrudRulesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="jobuser", password="secret123")
        self.client.force_login(self.user)
        self.pending_job = MiningDetectionJob.objects.create(
            title="Pending job",
            created_by=self.user,
            job_id=uuid4(),
            status=JobStatus.PENDING,
            extra_params={"coverage_id": "raster:demo"},
        )
        self.running_job = MiningDetectionJob.objects.create(
            title="Running job",
            created_by=self.user,
            job_id=uuid4(),
            status=JobStatus.RUNNING,
            extra_params={"coverage_id": "raster:demo"},
            progress_percentage=40,
            message_progress="Working",
        )

    def test_pending_job_update_page_is_available(self):
        response = self.client.get(reverse("mining_detection:job_update", kwargs={"pk": self.pending_job.pk}))
        self.assertEqual(response.status_code, 200)

    def test_running_job_update_redirects(self):
        response = self.client.get(reverse("mining_detection:job_update", kwargs={"pk": self.running_job.pk}))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("mining_detection:job_detail", kwargs={"pk": self.running_job.pk}), response.url)

    def test_running_job_delete_redirects(self):
        response = self.client.post(reverse("mining_detection:job_delete", kwargs={"pk": self.running_job.pk}))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(MiningDetectionJob.objects.filter(pk=self.running_job.pk).exists())

    def test_legacy_job_detail_route_redirects(self):
        response = self.client.get(f"/mining-detection/{self.pending_job.pk}/")
        self.assertEqual(response.status_code, 302)

    def test_job_status_api_is_owner_scoped(self):
        response = self.client.get(reverse("mining_detection:job_status_api", kwargs={"pk": self.running_job.pk}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], JobStatus.RUNNING)

    def test_job_detail_renders_statistics_read_only(self):
        MiningDetectionJob.objects.filter(pk=self.pending_job.pk).update(
            status=JobStatus.COMPLETED,
            completed_at=timezone.now(),
        )
        response = self.client.get(reverse("mining_detection:job_detail", kwargs={"pk": self.pending_job.pk}))
        self.assertEqual(response.status_code, 200)
