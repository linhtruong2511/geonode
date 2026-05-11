import logging
from django.db.models import F
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D
from datetime import timedelta
from ..models import Measurement, DataComparison, AnalysisJob, JobStatus, DataSourceType

logger = logging.getLogger(__name__)

class ComparisonService:
    """
    Dịch vụ thực hiện so sánh đối chiếu dữ liệu giữa các nguồn khác nhau (ví dụ: OCO-2 vs GOSAT-2).
    Tìm kiếm các cặp điểm đo trùng khớp về không-thời gian (co-located points).
    """

    def run_comparison(self, job_id, max_distance_km=50, max_time_diff_hours=2):
        """
        Thực hiện quy trình so sánh cho một AnalysisJob.
        :param job_id: ID của AnalysisJob.
        :param max_distance_km: Khoảng cách tối đa cho phép giữa 2 điểm (km).
        :param max_time_diff_hours: Chênh lệch thời gian tối đa cho phép (giờ).
        """
        try:
            job = AnalysisJob.objects.get(pk=job_id)
        except AnalysisJob.DoesNotExist:
            logger.error(f"Không tìm thấy AnalysisJob id={job_id}")
            return

        job.status = JobStatus.RUNNING
        job.progress_percent = 5
        job.save()

        logger.info(f"Bắt đầu so sánh OCO-2 và GOSAT-2 cho Job {job_id}")

        # 0. Xóa các kết quả so sánh cũ của Job này (nếu có) để re-run
        DataComparison.objects.filter(job=job).delete()

        # 1. Lấy danh sách điểm đo OCO-2 (chọn các điểm chất lượng tốt)
        oco2_qs = Measurement.objects.filter(
            data_source='OCO2',
            xco2_quality_flag=0,
            deleted_at__isnull=True
        )

        # 2. Lấy danh sách điểm đo GOSAT-2 (chất lượng tốt)
        gosat2_qs = Measurement.objects.filter(
            data_source='GOSAT2',
            xco2_quality_flag=0,
            deleted_at__isnull=True
        )

        total_oco2 = oco2_qs.count()
        if total_oco2 == 0 or gosat2_qs.count() == 0:
            job.status = JobStatus.FAILED
            job.parameters["error"] = "Không đủ dữ liệu từ cả hai nguồn để so sánh."
            job.save()
            return

        count = 0
        pairs_found = 0

        # Xóa các kết quả so sánh cũ của Job này nếu cần (tùy thuộc vào thiết kế logic)
        # DataComparison.objects.filter(...) - Cần thêm trường job vào DataComparison nếu muốn quản lý theo Job

        for oco2_pt in oco2_qs.iterator():
            # Tìm các điểm GOSAT-2 gần điểm OCO-2 này về cả không gian và thời gian
            time_min = oco2_pt.measurement_time - timedelta(hours=max_time_diff_hours)
            time_max = oco2_pt.measurement_time + timedelta(hours=max_time_diff_hours)

            matches = gosat2_qs.filter(
                measurement_time__range=(time_min, time_max),
                geom__distance_lte=(oco2_pt.geom, D(km=max_distance_km))
            ).annotate(
                distance=Distance('geom', oco2_pt.geom)
            )

            for g2_pt in matches:
                # Tính toán chênh lệch nồng độ
                diff = oco2_pt.xco2_ppm - g2_pt.xco2_ppm
                
                # Lưu kết quả ghép cặp
                DataComparison.objects.create(
                    job=job,
                    oco2_measurement=oco2_pt,
                    gosat2_measurement=g2_pt,
                    spatial_distance_km=g2_pt.distance.km,
                    xco2_difference_ppm=diff,
                    comparison_type='SPATIAL'
                )
                pairs_found += 1

            count += 1
            if count % 100 == 0:
                job.progress_percent = min(95, 5 + int((count / total_oco2) * 90))
                job.save()

        job.status = JobStatus.COMPLETED
        job.progress_percent = 100
        job.parameters["pairs_matched"] = pairs_found
        job.save()

        logger.info(f"✅ Hoàn thành so sánh Job {job_id}. Tìm thấy {pairs_found} cặp điểm trùng khớp.")
