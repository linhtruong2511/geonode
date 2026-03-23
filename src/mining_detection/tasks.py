"""
mining_detection/tasks.py

Celery tasks để:
1. Gửi job tới AI service (POST /analyze)
2. Poll trạng thái định kỳ (GET /status/{job_id})
3. Lấy kết quả và link Dataset khi COMPLETED (GET /result/{job_id})
"""

import logging
from datetime import datetime, timezone

import requests
from celery import shared_task
from django.conf import settings
from celery.utils.log import get_task_logger
from .models import InferenceStatistics, JobStatus, MiningDetectionJob
from geonode.resource.models import ExecutionRequest
from geonode.base.models import TopicCategory

logger = logging.getLogger(__name__)
celery_logger = get_task_logger(__name__)
AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai_api:8001")
AI_POLL_INTERVAL = getattr(settings, "AI_POLL_INTERVAL_SECONDS", 2)
AI_MAX_POLLS = getattr(settings, "AI_MAX_POLLS", 120)  # 2 phút max


@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def sync_job(self, job_pk: int):
    """
    Task chính: submit job → poll đến khi xong → lấy kết quả.
    Dùng Celery retry với countdown để tránh vòng lặp chặt.
    """
    try:
        job = MiningDetectionJob.objects.get(pk=job_pk)
    except MiningDetectionJob.DoesNotExist:
        logger.error(f"Job pk={job_pk} không tồn tại")
        return
    celery_logger.info(f'job status: {job.status}')
    # --- Bước 1: Submit nếu chưa có job_id từ service ---
    if job.status == JobStatus.PENDING:
        celery_logger.info('job status')
        try:
            _submit_job(job)
        except Exception as exc:
            logger.exception(f"Lỗi submit job {job.pk}: {exc}")
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            job.save(update_fields=["status", "error_message", "updated_at"])
            return

    try:
        save_result_job(job)
    except Exception as exc:
        logger.exception(f"Lỗi fetch result cho job {job.pk}: {exc}")
        self.retry(countdown=AI_POLL_INTERVAL, exc=exc)
        
def _submit_job(job: MiningDetectionJob):
    """Gọi POST /analyze với tham số từ Job."""
    from django.contrib.gis.geos import GEOSGeometry
    import json

    # Chuyển PolygonField sang GeoJSON bbox để gửi lên service
    geom = job.aoi_geom
    bbox = list(geom.extent)  # [minx, miny, maxx, maxy]

    payload = {
        "bbox": bbox,
        "date_from": job.date_from.isoformat(),
        "date_to": job.date_to.isoformat(),
        "model_version": job.model_version,
        "cloud_cover_pct": job.cloud_cover_pct,
        **job.extra_params,
    }

    response = requests.post(
        f"{AI_SERVICE_URL}/analyze",
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    # AI service trả về job_id — cập nhật vào Job
    # (Lưu ý: job.job_id ban đầu là UUID tự sinh, thay bằng UUID từ service)
    remote_job_id = data.get("job_id")
    if remote_job_id:
        job.job_id = remote_job_id

    job.status = JobStatus.RUNNING
    job.save(update_fields=["job_id", "status", "updated_at"])
    logger.info(f"Submitted job {job.pk} → remote job_id={job.job_id}")


def save_result_job(job: MiningDetectionJob):
    """Gọi GET /result/{job_id}, lưu statistics, link Dataset GeoNode."""
    url = f"{AI_SERVICE_URL}/result/{job.job_id}"
    logger.info(f"Bắt đầu gọi đến url {url} để lấy kết quả phân tích")
    try:
        response = requests.get(
            url,
            timeout=15,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        job.status = JobStatus.FAILED
        job.error_message = response.json().get('detail', f"Lỗi mất kết nối ....")
        job.save(update_fields=["status", "error_message", "updated_at"])
        logger.error(f"GET result lỗi cho job {job.job_id}: {exc}")
        raise Exception(f"GET result lỗi cho job {job.job_id}: {exc}")
    
    if not response.ok:
        logger.error(f"GET result trả về status code {response.status_code} cho job {job.job_id}")
        job.status = JobStatus.FAILED
        job.error_message = response.json().get('detail', f"GET result trả về status code {response.status_code}")
        job.save(update_fields=["status", "error_message", "updated_at"])
        raise Exception(f"GET result trả về status code {response.status_code}")
    
    data = response.json()
    celery_logger.debug(f"Kết quả trả về từ phiên phân tích {job.job_id}")

    stats_data = data.get("statistics", {})
    # shapefile_url = data.get("shapefile_url", "")
    execution_id = data.get('execution_id', None)
    
    # Tìm Dataset GeoNode tương ứng với shapefile_url
    # result_dataset = _find_geonode_dataset(execution_id)

    # Tạo/cập nhật InferenceStatistics
    infer, _ = InferenceStatistics.objects.update_or_create(
        job=job,
        defaults={
            "total_area_ha": stats_data.get("total_area_ha", 0),
            "count":         stats_data.get("count", 0),
            "max_area_ha":   stats_data.get("max_area_ha", 0),
            "min_area_ha":   stats_data.get("min_area_ha", 0),
            "avg_ndvi":      stats_data.get("avg_ndvi", 0),
            "avg_ndwi":      stats_data.get("avg_ndwi", 0),
            "avg_bsi":       stats_data.get("avg_bsi", 0),
            "raw_response":  data,
        },
    )

    job.status = JobStatus.COMPLETED
    # job.shapefile_url = shapefile_url
    # job.result_dataset = result_dataset
    job.completed_at = datetime.now(tz=timezone.utc)
    job.result_execution_id = execution_id
    
    job.save(update_fields=[
        "status", "completed_at", "result_execution_id", "updated_at"
    ])
    
    logger.info(f"Job {job.pk} đã COMPLETED với execution_id={execution_id}")
    
    return infer

@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def get_dataset_from_execution_id(self, job_id: str, execution_id: str):
    dataset = _find_geonode_dataset(execution_id=execution_id)
    job = MiningDetectionJob.objects.get(job_id=job_id)
    if job is not None: 
        job.result_dataset = dataset
        job.save(update_fields=['result_dataset'])
        logger.info("job dataset updated")
    else:
        logger.warning(f"Job id {job_id} not exist ")
    if dataset is None:
        self.retry(countdown=10, exc=Exception("Dataset chưa sẵn sàng, retry sau 10s"))
    else:
        return {
            'dataset': {
                'title': dataset.title,
                'url': dataset.detail_url
            }
        }

def _find_geonode_dataset(execution_id: str):
    """
    Tìm Dataset GeoNode từ execution_id.
    AI service upload shapefile và trả về id của phiên upload
    """
    if not execution_id:
        return None

    try:
        from geonode.layers.models import Dataset

        execution_req = ExecutionRequest.objects.get(exec_id=execution_id)
        dataset = Dataset.objects.get(pk=execution_req.output_params['resources'][0].get('id'))
        dataset.category = TopicCategory.objects.get(identifier='mining_detection')
        dataset.save(update_fields=['category']) 
        if not dataset:
            # Thử tìm theo typename nếu alternate không khớp
            logger.warning(f"Không tìm thấy dataset từ execution id {execution_id}")
        return dataset
    except Exception as exc:
        logger.warning(f"Lỗi lấy thông tin từ execution id: {execution_id}")
        return None