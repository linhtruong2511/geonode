"""
mining_detection/template_views.py

Views Django thuần (CBV) render template — tuân theo pattern của GeoNode.
Tách riêng với views.py (DRF ViewSets) để rõ ràng.
"""

import json
import logging
from urllib.parse import urljoin

import requests
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.generic import DetailView, ListView
from .forms import MiningJobCreateForm
from .models import JobStatus, MiningDetectionJob
from geonode.layers.models import Dataset
from django.core.paginator import Paginator
from .services import send_analyze_job, save_job_to_db

logger = logging.getLogger(__name__)

AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai-api:8001")


# ──────────────────────────────────────────────────────────────────────────────
# List view
# ──────────────────────────────────────────────────────────────────────────────

class JobListView(ListView):
    """
    Danh sách jobs của user hiện tại.
    URL: /mining-detection/
    Template: mining_detection/job_list.html
    """
    model = MiningDetectionJob
    template_name = "mining_detection/job_index.html"
    context_object_name = "jobs"
    paginate_by = 5

    def get_queryset(self):
        qs = (
            MiningDetectionJob.objects
            .select_related("statistics", "created_by", "result_dataset")
            .order_by("-created_at")
        )
        # Filter theo status nếu có
        status_filter = self.request.GET.get("status")
        if status_filter and status_filter in JobStatus.values:
            qs = qs.filter(status=status_filter)
        # Filter theo search
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(title__icontains=q)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["status_choices"] = JobStatus.choices
        ctx["current_status"] = self.request.GET.get("status", "")
        ctx["search_query"] = self.request.GET.get("q", "")
        # Thống kê nhanh
        all_jobs = MiningDetectionJob.objects.all()
        ctx["stats"] = {
            "total": all_jobs.count(),
            "completed": all_jobs.filter(status=JobStatus.COMPLETED).count(),
            "running": all_jobs.filter(status=JobStatus.RUNNING).count(),
            "failed": all_jobs.filter(status=JobStatus.FAILED).count(),
        }
        return ctx


# ──────────────────────────────────────────────────────────────────────────────
# Create view
# ──────────────────────────────────────────────────────────────────────────────

@method_decorator(login_required, name="dispatch")
class JobCreateView(View):
    """
    Form tạo job mới — gửi yêu cầu phân tích tới AI service.
    URL: /mining-detection/new/
    Template: mining_detection/job_create.html
    """
    template_name = "mining_detection/job_add.html"

    def get(self, request):
        form = MiningJobCreateForm()
        datasets = Dataset.objects.filter(subtype='raster').order_by('-created')
        paginator = Paginator(datasets, 9)
        page_number = request.GET.get('page', 1)
        page_obj = paginator.get_page(page_number)
        return render(request, self.template_name, {"form": form, 'page_obj': page_obj})

    def post(self, request):
        logger.info('Bắt đấu gửi yêu cầu phân tích')
        form = MiningJobCreateForm(request.POST)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form})

        session_id = request.session.session_key or "anonymous"
        payload = form.get_payload(session_id)
        logger.info(f'Hoàn thành tạo payload gửi đi: {payload}')
        
        # send payload đến AI service, lấy về job_id từ response
        try:
            analyze_response = send_analyze_job(payload, f"{AI_SERVICE_URL}/analyze")
        except Exception as e:
            messages.error(request, f'Lỗi khi gửi yêu cầu phân tích: {e}')
            return render(request, self.template_name, {"form": form})
        remote_job_id = analyze_response.get("job_id")

        logger.info(f'Nhận được job_id: {remote_job_id}')
        if not remote_job_id:
            logger.error(f'AI service không trả về job_id: {analyze_response}')
            messages.error(request, f"AI service không trả về job_id: {analyze_response}")
            return render(request, self.template_name, {"form": form})
        
        job_pk = save_job_to_db(form, payload, remote_job_id, request.user)

        # transaction.on_commit(lambda: submit_and_poll_job.apply_async(args=[job_pk], queue='default')) #Đảm bảo job phải được commit thì mới bắt đầu chạy

        messages.success(
            request,
            f"Đã gửi yêu cầu phân tích thành công! Job ID: {job_pk}. "
            "Kết quả sẽ cập nhật tự động."
        )
        return redirect("mining_detection:job_detail", pk=job_pk)


class JobDetailView(DetailView):
    """
    Chi tiết một job — polling trạng thái bằng JS (AJAX).
    URL: /mining-detection/<pk>/
    Template: mining_detection/job_detail.html
    """
    model = MiningDetectionJob
    template_name = "mining_detection/job_detail.html"
    context_object_name = "job"

    def get_queryset(self):
        return MiningDetectionJob.objects.select_related(
            "statistics", "created_by", "result_dataset"
        )
        
# ──────────────────────────────────────────────────────────────────────────────
# AJAX endpoints
# ──────────────────────────────────────────────────────────────────────────────

def job_status_api(request, pk):
    """
    AJAX endpoint — trả về trạng thái job để frontend tự poll.
    GET /mining-detection/<pk>/status/
    """
    job = get_object_or_404(MiningDetectionJob, pk=pk)
    data = {
        "status": job.status,
        "poll_count": job.poll_count,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "error_message": job.error_message,
        "has_statistics": hasattr(job, "statistics") and job.statistics is not None,
        "shapefile_url": job.shapefile_url,
        "geonode_layer": job.geonode_layer_name,
        "message_progress": job.message_progress,
        "progress_percentage" : job.progress_percentage
    }
    if data["has_statistics"]:
        s = job.statistics
        data["statistics"] = {
            "total_area_ha": round(s.total_area_ha, 2),
            "count": s.count,
            "avg_ndvi": round(s.avg_ndvi, 3),
            "avg_ndwi": round(s.avg_ndwi, 3),
            "avg_bsi": round(s.avg_bsi, 3),
            "severity_label": s.severity_label,
        }
    return JsonResponse(data)


@login_required
def job_retry_view(request, pk):
    """
    Retry một job FAILED.
    POST /mining-detection/<pk>/retry/
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    job = get_object_or_404(MiningDetectionJob, pk=pk, created_by=request.user)
    if job.status != JobStatus.FAILED:
        messages.error(request, "Chỉ có thể retry job ở trạng thái FAILED.")
        return redirect("mining_detection:job_detail", pk=pk)

    # Re-submit tới AI service với cùng tham số
    payload = {
        "coverage_id":          job.extra_params.get("coverage_id", ""),
        # "date_range":           [job.date_from.isoformat(), job.date_to.isoformat()],
        # "bbox":                 list(job.aoi_geom.extent),
        "threshold":            job.extra_params.get("threshold", 0.57),
        "min_area_m2":          job.extra_params.get("min_area_m2", 500),
        "tile_size":            job.extra_params.get("tile_size", 512),
        "smooth":               job.extra_params.get("smooth", True),
        "closing_radius":       job.extra_params.get("closing_radius", 5),
        "simplify_tolerance":   job.extra_params.get("simplify_tolerance", 10),
        "compute_spectral":     job.extra_params.get("compute_spectral", True),
        "compute_change":       job.extra_params.get("compute_change", False),
    }
    try:
        response = requests.post(f"{AI_SERVICE_URL}/analyze", json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        messages.error(request, f"Lỗi khi retry: {e}")
        return redirect("mining_detection:job_detail", pk=pk)

    job_pk = save_job_to_db(payload['coverage_id'], data.get("job_id"), request.user, extra_params=payload)

    from .tasks import sync_job
    sync_job.apply_async(args=[job_pk], countdown=30)

    messages.success(request, "Job đã được gửi lại thành công.")
    return redirect("mining_detection:job_detail", pk=pk)