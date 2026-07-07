from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True)
def import_data_file_task(self, source_id, quality_only=True, bbox=None):
    """
    Tác vụ bất đồng bộ (Celery) để nhập dữ liệu từ tệp .nc4 (OCO-2) hoặc .h5 (GOSAT-2).
    """
    logger.info(f"Starting import for source {source_id}")
    from .services.import_service import ImportService
    service = ImportService()
    service.import_file(source_id, quality_only=quality_only, bbox=bbox)

@shared_task(bind=True)
def run_comparison_task(self, job_id):
    """
    Tác vụ bất đồng bộ để thực hiện so sánh đối chiếu giữa dữ liệu OCO-2 và GOSAT-2.
    Thường được kích hoạt sau khi dữ liệu từ hai nguồn đã được nhập vào hệ thống.
    """
    logger.info(f"Starting comparison job {job_id}")
    from .services.comparison_service import ComparisonService
    service = ComparisonService()
    service.run_comparison(job_id)

@shared_task(bind=True)
def run_analysis_job_task(self, job_id):
    """
    Điều phối viên (dispatcher) chung cho các tác vụ phân tích bất đồng bộ.
    Dựa trên loại công việc (job_type), nó sẽ gọi các service phân tích tương ứng.
    """
    logger.info(f"Starting analysis job {job_id}")
    from .models import AnalysisJob
    try:
        job = AnalysisJob.objects.get(pk=job_id)
        if job.job_type == 'COMPARISON':
            from .services.comparison_service import ComparisonService
            service = ComparisonService()
            service.run_comparison(job_id)
        elif job.job_type == 'TREND':
            # Sẽ triển khai TrendAnalysisService sau
            job.status = 'FAILED'
            job.parameters['error'] = "Trend analysis not implemented yet."
            job.save()
        else:
            logger.warning(f"Unknown job type: {job.job_type}")
    except AnalysisJob.DoesNotExist:
        logger.error(f"AnalysisJob {job_id} not found.")
