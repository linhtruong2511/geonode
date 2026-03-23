import requests
import logging
from .models import JobStatus
from geonode.layers.models import Dataset

logger = logging.getLogger(__name__)
def send_analyze_job(payload: dict, url: str):
    """
    Gửi yêu cầu phân tích đến AI service.
    Args:
        payload (dict): Dữ liệu cần gửi đến AI service.
        url (str): URL của AI service.
    Returns:
        dict: Phản hồi từ AI service nếu thành công, None nếu có lỗi.
    """
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()  # Kiểm tra nếu có lỗi HTTP
        return response.json()  # Trả về dữ liệu JSON từ phản hồi
    except requests.exceptions.RequestException as e:
        logger.error(f'Lỗi khi gửi yêu cầu phân tích: {e}')
        raise e
    
def save_job_to_db(form, payload: dict, remote_job_id: str, created_by, extra_params: dict = {}):
    """
    Lưu thông tin job vào database.
    Args:
        coverage_id (str): ID của dataset cần phân tích.
        remote_job_id (str): ID của job trên AI service.
        created_by: Người tạo job (user).
    Returns:
        MiningDetectionJob: Đối tượng job đã được lưu vào database.
    """
    extra_params = {
        "coverage_id":          payload["coverage_id"],
        "threshold":            payload["threshold"],
        "min_area_m2":          payload["min_area_m2"],
        "tile_size":            payload["tile_size"],
        "smooth":               payload["smooth"],
        "closing_radius":       payload["closing_radius"],
        "simplify_tolerance":   payload["simplify_tolerance"],
        "compute_spectral":     payload["compute_spectral"],
        "compute_change":       payload["compute_change"],
    }
    if payload.get("baseline_job_id"):
        extra_params["baseline_job_id"] = payload["baseline_job_id"]
    if payload.get("output_layer_name"):
        extra_params["output_layer_name"] = payload["output_layer_name"]
    job = form.save(commit=False)
    job.job_id = remote_job_id
    job.status = JobStatus.RUNNING
    job.created_by = created_by
    job.extra_params = extra_params
    job.base_dataset = Dataset.objects.get(alternate=payload["coverage_id"])
    job.save()
    return job.pk