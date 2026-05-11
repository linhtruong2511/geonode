import logging
from datetime import datetime, timedelta, timezone

import requests
from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model
from django.conf import settings

from geonode.base.models import TopicCategory
from geonode.resource.models import ExecutionRequest

from .models import InferenceStatistics, JobStatus, MiningDetectionJob, MiningSite
from .tasks_utils import send_download_mining_site_job

logger = logging.getLogger(__name__)
celery_logger = get_task_logger(__name__)

# URL của dịch vụ AI phục vụ phân tích ảnh vệ tinh
AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai_api:8001")
AI_POLL_INTERVAL = getattr(settings, "AI_POLL_INTERVAL_SECONDS", 2)
AI_MAX_POLLS = getattr(settings, "AI_MAX_POLLS", 120)
User = get_user_model()

@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def sync_job(self, job_pk: int):
    """
    Tác vụ đồng bộ hóa trạng thái công việc với AI Service.
    Thực hiện: Gửi yêu cầu phân tích (nếu mới) -> Theo dõi (poll) trạng thái -> Lưu kết quả.
    """
    try:
        job = MiningDetectionJob.objects.get(pk=job_pk)
    except MiningDetectionJob.DoesNotExist:
        logger.error("Job pk=%s does not exist", job_pk)
        return

    # Nếu công việc đang ở trạng thái chờ, thực hiện gửi yêu cầu tới AI API
    if job.status == JobStatus.PENDING:
        try:
            submit_job(job)
        except Exception as exc:
            logger.exception("Submit job failed for %s", job.pk)
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            job.save(update_fields=["status", "error_message", "updated_at"])
            return

    # Theo dõi trạng thái công việc và lấy kết quả khi hoàn thành
    try:
        job.poll_count = job.poll_count + 1
        job.save(update_fields=["poll_count", "updated_at"])
        save_result_job(job)
    except Exception as exc:
        logger.exception("Fetch result failed for %s", job.pk)
        # Thử lại sau một khoảng thời gian nếu kết quả chưa sẵn sàng
        self.retry(countdown=AI_POLL_INTERVAL, exc=exc)

def submit_job(job: MiningDetectionJob):
    """
    Gửi payload yêu cầu phân tích tới AI Service qua HTTP POST.
    """
    geom = job.aoi_geom
    bbox = list(geom.extent) if geom else None
    payload = {
        "bbox": bbox, # Vùng quan tâm (Bounding Box)
        "date_from": job.date_from.isoformat() if job.date_from else None,
        "date_to": job.date_to.isoformat() if job.date_to else None,
        "model_version": job.model_version, # Phiên bản mô hình AI sử dụng
        "cloud_cover_pct": job.cloud_cover_pct, # Ngưỡng mây tối đa
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
    """
    Lấy kết quả từ AI Service và cập nhật vào cơ sở dữ liệu cục bộ.
    Bao gồm các số liệu thống kê và ID của tệp kết quả trong GeoNode.
    """
    url = f"{AI_SERVICE_URL}/result/{job.job_id}"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        error_response = getattr(exc, "response", None)
        # 202 hoặc 404 có nghĩa là AI Service vẫn đang xử lý hoặc chưa có kết quả
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
    execution_id = data.get("execution_id") # ID kết quả trong hệ thống GeoNode

    # Lưu/Cập nhật các số liệu thống kê thu được từ AI
    infer, _ = InferenceStatistics.objects.update_or_create(
        job=job,
        defaults={
            "total_area_ha": stats_data.get("total_area_ha", 0), # Tổng diện tích (ha)
            "count": stats_data.get("count", 0), # Số lượng điểm khai thác phát hiện
            "max_area_ha": stats_data.get("max_area_ha", 0),
            "min_area_ha": stats_data.get("min_area_ha", 0),
            "avg_ndvi": stats_data.get("avg_ndvi", 0),
            "avg_ndwi": stats_data.get("avg_ndwi", 0),
            "avg_bsi": stats_data.get("avg_bsi", 0),
            "raw_response": data, # Lưu trữ toàn bộ phản hồi thô dưới dạng JSON
        },
    )

    # Cập nhật trạng thái cuối cùng của công việc
    job.status = JobStatus.COMPLETED if data.get("status") == "SUCCESS" else JobStatus.FAILED
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
    """
    Tác vụ tìm kiếm và liên kết Dataset đã được GeoNode xuất bản từ execution_id.
    """
    dataset = find_geonode_dataset(execution_id=execution_id)
    job = MiningDetectionJob.objects.filter(job_id=job_id).first()
    if job is None:
        logger.warning("Job id %s does not exist", job_id)
        return None

    if dataset is None:
        self.retry(countdown=10, exc=Exception("Dataset not ready yet"))

    # Phân loại và gán Dataset vào trường tương ứng (Raster hoặc Vector)
    if dataset.subtype == "raster":
        job.tif_result_dataset = dataset
    else:
        job.result_dataset = dataset
    job.save(update_fields=["result_dataset"])
    return {"dataset": {"title": dataset.title, "url": dataset.detail_url}}


def build_auto_monitoring_output_layer_name(site: MiningSite, dataset, params: dict):
    """Xây dựng tên lớp dữ liệu đầu ra cho quy trình giám sát tự động"""
    base_name = params.get("output_layer_name")
    if not base_name:
        return None

    suffix = f"{site.pk}_{datetime.now(timezone.utc).strftime('%Y%m%d')}_{dataset.pk}"
    max_base_len = max(1, 128 - len(suffix) - 1)
    return f"{base_name[:max_base_len]}_{suffix}"


def create_auto_monitoring_job(site: MiningSite, dataset, user_id):
    """
    Khởi tạo một công việc phân tích AI tự động cho một vị trí khai thác mỏ khi có dữ liệu vệ tinh mới.
    """
    if not dataset or getattr(dataset, "subtype", None) != "raster":
        return None

    model_id = (site.auto_monitoring_model_id or "").strip()
    if not model_id:
        logger.warning("Skip auto monitoring analyze for site %s because no model is configured.", site.pk)
        return None

    user = User.objects.filter(pk=user_id).first() if user_id else None
    if user is None:
        logger.warning("Skip auto monitoring analyze for site %s because user_id=%s is invalid.", site.pk, user_id)
        return None

    interval_days = max(site.auto_monitoring_interval_days or 1, 1)
    date_to = datetime.now(timezone.utc).date()
    date_from = date_to - timedelta(days=interval_days)
    extra_params = dict(site.auto_monitoring_inference_params or {})
    extra_params["coverage_id"] = dataset.alternate

    output_layer_name = build_auto_monitoring_output_layer_name(site, dataset, extra_params)
    if output_layer_name:
        extra_params["output_layer_name"] = output_layer_name

    # Tạo đối tượng Job và bắt đầu đồng bộ hóa với AI Service
    job = MiningDetectionJob.objects.create(
        title=f"Auto monitoring - {site.name} - {date_to.isoformat()}",
        created_by=user,
        status=JobStatus.PENDING,
        model_version=model_id,
        cloud_cover_pct=site.monitoring_dataset_cloud_cover,
        date_from=date_from,
        date_to=date_to,
        base_dataset=dataset,
        extra_params=extra_params,
    )
    sync_job.delay(job.pk)
    logger.info("Created auto monitoring job %s for site %s and dataset %s.", job.pk, site.pk, dataset.pk)
    return job

@shared_task(bind=True, max_retries=AI_MAX_POLLS)
def get_monitoring_dataset_from_execution_id(self, execution_id: str, site_id: int, user_id=None):
    """Tác vụ liên kết dữ liệu vệ tinh vừa tải về vào một vị trí khai thác mỏ để theo dõi"""
    dataset = find_geonode_dataset(execution_id=execution_id)
    site = MiningSite.objects.filter(pk=site_id).first()
    if site is None:
        logger.warning("Mining site id %s does not exist", site_id)
        return None

    if dataset is None:
        self.retry(countdown=10, exc=Exception("Dataset not ready yet"))

    site.monitoring_datasets.add(dataset)
    auto_job = None
    # Nếu vị trí này được thiết lập giám sát tự động, kích hoạt công việc phân tích AI ngay
    if site.is_auto_monitoring:
        auto_job = create_auto_monitoring_job(site, dataset, user_id)
    logger.info("Added dataset %s to monitoring datasets of site %s", dataset.id, site.id)
    return {
        "site_id": site.id,
        "dataset": {"title": dataset.title, "url": dataset.detail_url},
        "job_id": auto_job.pk if auto_job else None,
    }

def find_geonode_dataset(execution_id: str):
    """
    Hàm hỗ trợ tìm kiếm Dataset trong GeoNode dựa trên execution_id của quá trình xử lý.
    Cập nhật danh mục (category) cho Dataset để dễ quản lý.
    """
    if not execution_id:
        return None
    try:
        from geonode.layers.models import Dataset

        execution_req = ExecutionRequest.objects.get(exec_id=execution_id)
        dataset_id = execution_req.output_params["resources"][0].get("id")
        dataset = Dataset.objects.get(pk=dataset_id)
        # Gán vào danh mục 'mining_detection'
        dataset.category = TopicCategory.objects.get(identifier="mining_detection")
        dataset.save(update_fields=["category"])
        return dataset
    except Exception:
        logger.warning("Failed to locate dataset from execution id %s", execution_id)
        return None

def download_sentinel2_data_cron_tab(user_id: int):
    """
    Công việc định kỳ (Cron) để tự động kích hoạt việc tải dữ liệu Sentinel-2 cho các vị trí giám sát.
    """
    mining_sites = MiningSite.objects.filter(is_auto_monitoring=True).all()
    send_download_mining_site_job(mining_sites, user_id)
