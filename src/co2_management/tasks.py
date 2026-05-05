from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True)
def import_data_file_task(self, source_id):
    """Async import .nc4/.h5 file"""
    logger.info(f"Starting import for source {source_id}")
    from .services.import_service import ImportService
    service = ImportService()
    service.import_file(source_id)

@shared_task(bind=True)
def run_comparison_task(self, job_id):
    """Async OCO-2 vs GOSAT-2 comparison"""
    logger.info(f"Starting comparison job {job_id}")
    from .services.comparison_service import ComparisonService
    service = ComparisonService()
    service.run_comparison(job_id)

@shared_task(bind=True)
def run_analysis_job_task(self, job_id):
    """Generic async analysis dispatcher"""
    logger.info(f"Starting analysis job {job_id}")
    pass
