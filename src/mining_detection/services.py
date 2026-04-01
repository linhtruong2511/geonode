import logging

import requests
from django.conf import settings

from geonode.layers.models import Dataset

from .models import JobStatus, MiningDetectionJob

logger = logging.getLogger(__name__)


def get_ai_model_catalog():
    url = f"{getattr(settings, 'AI_SERVICE_URL', 'http://ai_api:8001').rstrip('/')}/models"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("Failed to fetch model catalog from %s: %s", url, exc)
        return {"default_model_id": "", "models": []}

    data = response.json()
    models = data.get("models") or []
    if not isinstance(models, list):
        models = []
    return {
        "default_model_id": data.get("default_model_id") or "",
        "models": models,
    }


def build_model_choices(model_catalog: dict):
    choices = []
    for model in model_catalog.get("models", []):
        model_id = model.get("model_id")
        if not model_id:
            continue
        label = model_id
        if model.get("is_default"):
            label = f"{label} (default)"
        if model.get("is_loaded"):
            label = f"{label} - loaded"
        choices.append((model_id, label))
    return choices


def send_analyze_job(payload: dict, url: str):
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as exc:
        logger.error("Failed to submit analyze request: %s", exc)
        raise


def populate_job_from_payload(job: MiningDetectionJob, payload: dict, created_by, remote_job_id: str):
    extra_params = {
        "coverage_id": payload["coverage_id"],
        "threshold": payload["threshold"],
        "min_area_m2": payload["min_area_m2"],
        "tile_size": payload["tile_size"],
        "smooth": payload["smooth"],
        "closing_radius": payload["closing_radius"],
        "simplify_tolerance": payload["simplify_tolerance"],
        "compute_spectral": payload["compute_spectral"],
        "compute_change": payload["compute_change"],
    }
    if payload.get("baseline_job_id"):
        extra_params["baseline_job_id"] = payload["baseline_job_id"]
    if payload.get("output_layer_name"):
        extra_params["output_layer_name"] = payload["output_layer_name"]
    if payload.get("model_id"):
        job.model_version = payload["model_id"]

    job.job_id = remote_job_id
    job.status = JobStatus.RUNNING
    job.created_by = created_by
    job.extra_params = extra_params
    job.base_dataset = Dataset.objects.filter(alternate=payload["coverage_id"]).first()
    return job


def save_job_to_db(form, payload: dict, remote_job_id: str, created_by):
    job = form.save(commit=False)
    job = populate_job_from_payload(job, payload, created_by, remote_job_id)
    job.save()
    return job.pk


def clone_job_for_retry(job: MiningDetectionJob, payload: dict, remote_job_id: str):
    retried_job = MiningDetectionJob(
        title=f"{job.title} (retry)",
        model_version=job.model_version,
        cloud_cover_pct=job.cloud_cover_pct,
        date_from=job.date_from,
        date_to=job.date_to,
        aoi_geom=job.aoi_geom,
    )
    retried_job = populate_job_from_payload(
        retried_job,
        payload,
        created_by=job.created_by,
        remote_job_id=remote_job_id,
    )
    retried_job.save()
    return retried_job.pk
