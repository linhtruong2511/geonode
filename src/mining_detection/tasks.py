import logging
from datetime import datetime, timezone

import requests
from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings

from geonode.base.models import TopicCategory
from geonode.resource.models import ExecutionRequest

from .models import InferenceStatistics, JobStatus, MiningDetectionJob

logger = logging.getLogger(__name__)
celery_logger = get_task_logger(__name__)
AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai_api:8001")
AI_POLL_INTERVAL = getattr(settings, "AI_POLL_INTERVAL_SECONDS", 2)
AI_MAX_POLLS = getattr(settings, "AI_MAX_POLLS", 120)


@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def sync_job(self, job_pk: int):
    try:
        job = MiningDetectionJob.objects.get(pk=job_pk)
    except MiningDetectionJob.DoesNotExist:
        logger.error("Job pk=%s does not exist", job_pk)
        return

    if job.status == JobStatus.PENDING:
        try:
            _submit_job(job)
        except Exception as exc:
            logger.exception("Submit job failed for %s", job.pk)
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            job.save(update_fields=["status", "error_message", "updated_at"])
            return

    try:
        job.poll_count = job.poll_count + 1
        job.save(update_fields=["poll_count", "updated_at"])
        save_result_job(job)
    except Exception as exc:
        logger.exception("Fetch result failed for %s", job.pk)
        self.retry(countdown=AI_POLL_INTERVAL, exc=exc)


def _submit_job(job: MiningDetectionJob):
    geom = job.aoi_geom
    bbox = list(geom.extent) if geom else None
    payload = {
        "bbox": bbox,
        "date_from": job.date_from.isoformat() if job.date_from else None,
        "date_to": job.date_to.isoformat() if job.date_to else None,
        "model_version": job.model_version,
        "cloud_cover_pct": job.cloud_cover_pct,
        **job.extra_params,
    }
    response = requests.post(f"{AI_SERVICE_URL}/analyze", json=payload, timeout=30)
    response.raise_for_status()
    remote_job_id = response.json().get("job_id")
    if remote_job_id:
        job.job_id = remote_job_id
    job.status = JobStatus.RUNNING
    job.message_progress = "Job submitted."
    job.progress_percentage = max(job.progress_percentage, 5)
    job.save(update_fields=["job_id", "status", "message_progress", "progress_percentage", "updated_at"])


def save_result_job(job: MiningDetectionJob):
    url = f"{AI_SERVICE_URL}/result/{job.job_id}"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        error_response = getattr(exc, "response", None)
        if error_response is not None and error_response.status_code in (202, 404):
            job.message_progress = "Result not ready yet."
            job.progress_percentage = min(max(job.progress_percentage, 10), 95)
            job.save(update_fields=["message_progress", "progress_percentage", "updated_at"])
            raise Exception("Result not ready yet")

        detail = "Connection error while fetching result."
        if error_response is not None:
            try:
                detail = error_response.json().get("detail", detail)
            except ValueError:
                detail = error_response.text or detail
        job.status = JobStatus.FAILED
        job.error_message = detail
        job.message_progress = ""
        job.save(update_fields=["status", "error_message", "message_progress", "updated_at"])
        raise

    data = response.json()
    stats_data = data.get("statistics", {})
    execution_id = data.get("execution_id")

    infer, _ = InferenceStatistics.objects.update_or_create(
        job=job,
        defaults={
            "total_area_ha": stats_data.get("total_area_ha", 0),
            "count": stats_data.get("count", 0),
            "max_area_ha": stats_data.get("max_area_ha", 0),
            "min_area_ha": stats_data.get("min_area_ha", 0),
            "avg_ndvi": stats_data.get("avg_ndvi", 0),
            "avg_ndwi": stats_data.get("avg_ndwi", 0),
            "avg_bsi": stats_data.get("avg_bsi", 0),
            "raw_response": data,
        },
    )

    job.status = JobStatus.COMPLETED
    job.message_progress = ""
    job.progress_percentage = 100
    job.completed_at = datetime.now(tz=timezone.utc)
    job.result_execution_id = execution_id
    job.save(
        update_fields=[
            "status",
            "message_progress",
            "progress_percentage",
            "completed_at",
            "result_execution_id",
            "updated_at",
        ]
    )
    return infer


@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def get_dataset_from_execution_id(self, job_id: str, execution_id: str):
    dataset = _find_geonode_dataset(execution_id=execution_id)
    job = MiningDetectionJob.objects.filter(job_id=job_id).first()
    if job is None:
        logger.warning("Job id %s does not exist", job_id)
        return None

    if dataset is None:
        self.retry(countdown=10, exc=Exception("Dataset not ready yet"))

    job.result_dataset = dataset
    job.save(update_fields=["result_dataset"])
    return {"dataset": {"title": dataset.title, "url": dataset.detail_url}}


def _find_geonode_dataset(execution_id: str):
    if not execution_id:
        return None
    try:
        from geonode.layers.models import Dataset

        execution_req = ExecutionRequest.objects.get(exec_id=execution_id)
        dataset_id = execution_req.output_params["resources"][0].get("id")
        dataset = Dataset.objects.get(pk=dataset_id)
        dataset.category = TopicCategory.objects.get(identifier="mining_detection")
        dataset.save(update_fields=["category"])
        return dataset
    except Exception:
        logger.warning("Failed to locate dataset from execution id %s", execution_id)
        return None
