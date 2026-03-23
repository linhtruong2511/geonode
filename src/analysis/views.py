import logging
import requests
from django.conf import settings
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.generic import ListView
from django.contrib.auth import get_user_model
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.permissions import AllowAny
from geonode.upload.api.views import ImporterViewSet

from .models import Analysis
from geonode.layers.models import Dataset

User = get_user_model()
logger = logging.getLogger("analysis")

AI_SERVICE_URL = getattr(settings, 'AI_SERVICE_URL', 'http://ai_api:8001')


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_owner(request):
    if request.user and not request.user.is_anonymous:
        return request.user
    return User.objects.filter(is_superuser=True).first()


def _fetch_ai_result(job_id):
    """Returns the parsed JSON from /result/<job_id> or None on error."""
    try:
        url = f"{AI_SERVICE_URL}/result/{job_id}"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Could not fetch AI result for {job_id}: {e}")
    return None


def _fetch_ai_status(job_id):
    """Returns the parsed JSON from /status/<job_id> or None on error."""
    try:
        url = f"{AI_SERVICE_URL}/status/{job_id}"
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Could not fetch AI status for {job_id}: {e}")
    return None


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

def index(request):
    return render(request, 'analysis/index.html', {})


class AnalysisList(ListView):
    model = Analysis
    template_name = 'analysis/analysis_list.html'

    def get_queryset(self):
        return Analysis.objects.select_related('target_dataset', 'owner').order_by('-analysis_date')


def create(request):
    """Dataset picker page — let the user choose which raster to analyze."""
    datasets = Dataset.objects.all().order_by('title')
    return render(request, 'analysis/create.html', {'dataset': datasets})


def analyze(request, dataset_id):
    """
    GET  → Show the inference configuration form.
    POST → Submit the job to the AI service and create an Analysis record.
    """
    dataset = get_object_or_404(Dataset, pk=dataset_id)

    if request.method == "POST":
        # Collect all form parameters
        output_layer_name = request.POST.get("output_layer_name", f"ai_mining_{dataset.name}")
        threshold = float(request.POST.get("threshold", 0.57))
        min_area_m2 = int(request.POST.get("min_area_m2", 500))
        tile_size = int(request.POST.get("tile_size", 512))
        smooth = request.POST.get("smooth") == "on"
        closing_radius = int(request.POST.get("closing_radius", 5))
        simplify_tolerance = float(request.POST.get("simplify_tolerance", 10.0))
        compute_spectral = request.POST.get("compute_spectral") == "on"
        session_id = request.session.session_key or "anonymous"

        input_params = {
            "coverage_id": dataset.alternate,
            "session_id": session_id,
            "bbox": [dataset.bbox_x0, dataset.bbox_y0, dataset.bbox_x1, dataset.bbox_y1],
            "threshold": threshold,
            "min_area_m2": min_area_m2,
            "tile_size": tile_size,
            "smooth": smooth,
            "closing_radius": closing_radius,
            "simplify_tolerance": simplify_tolerance,
            "compute_spectral": compute_spectral,
            "output_layer_name": output_layer_name,
        }

        try:
            ai_url = f"{AI_SERVICE_URL}/analyze"
            response = requests.post(ai_url, json=input_params, timeout=15)
            response.raise_for_status()
            result = response.json()
            job_id = result.get('job_id')

            analysis = Analysis.objects.create(
                target_dataset=dataset,
                job_id=job_id,
                status='PROCESSING',
                title=output_layer_name,
                name=output_layer_name,
                owner=_get_owner(request),
                input_params=input_params,
            )

            return render(request, 'analysis/analysis_list.html', {
                'message': f"✅ Đã gửi yêu cầu phân tích! Job ID: {job_id}",
                'object_list': Analysis.objects.select_related('target_dataset', 'owner').order_by('-analysis_date'),
            })

        except requests.exceptions.ConnectionError:
            error = "Không thể kết nối đến AI Service. Hãy chắc chắn service đang chạy."
        except requests.exceptions.Timeout:
            error = "AI Service không phản hồi (timeout). Thử lại sau."
        except Exception as e:
            logger.exception(f"Error calling AI Service: {e}")
            error = f"Lỗi khi gửi yêu cầu tới AI Service: {str(e)}"

        return render(request, 'analysis/analysis_form.html', {
            'dataset': dataset,
            'error': error,
        })

    # GET — show form
    return render(request, 'analysis/analysis_form.html', {'dataset': dataset})


def analysis_detail(request, pk):
    """Detail view for a single inference run."""
    analysis = get_object_or_404(
        Analysis.objects.select_related('target_dataset', 'owner'), pk=pk
    )
    return render(request, 'analysis/analysis_detail.html', {'analysis': analysis})


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

def check_status_api(request, job_id):
    """
    Internal API for the frontend to poll job progress.
    Syncs from AI service on-demand if still PROCESSING.
    """
    analysis = get_object_or_404(Analysis, job_id=job_id)

    if analysis.status in ('COMPLETED', 'FAILED'):
        return _analysis_json(analysis)

    # Try to sync from AI service
    ai_data = _fetch_ai_status(job_id)
    if ai_data:
        ai_status = ai_data.get('status')
        if ai_status == 'COMPLETED':
            result_data = _fetch_ai_result(job_id)
            if result_data:
                analysis.apply_result(result_data)
                analysis.save()
        elif ai_status == 'FAILED':
            analysis.status = 'FAILED'
            analysis.error_message = ai_data.get('message', '')
            analysis.save()
        else:
            # Still running — reflect progress message
            analysis.error_message = ai_data.get('message', '')
            analysis.save(update_fields=['error_message', 'updated_at'])

    return _analysis_json(analysis, ai_data=ai_data)


def _analysis_json(analysis, ai_data=None):
    data = {
        "status": analysis.status,
        "total_area_ha": analysis.total_area_ha,
        "count": analysis.count,
        "avg_ndvi": analysis.avg_ndvi,
        "avg_ndwi": analysis.avg_ndwi,
        "avg_bsi": analysis.avg_bsi,
        "shapefile_url": analysis.shapefile_url,
    }
    if ai_data:
        data["progress"] = ai_data.get("progress")
        data["message"] = ai_data.get("message")
    return JsonResponse(data)


class AnalysisUpdateResult(APIView):
    """
    Webhook: AI Service POSTs the final result to this endpoint.
    Expected body mirrors the /result/{job_id} schema.
    """
    permission_classes = [AllowAny]

    def post(self, request, job_id):
        analysis = get_object_or_404(Analysis, job_id=job_id)
        analysis.apply_result(request.data)
        analysis.save()
        logger.info(f"Analysis {job_id} marked COMPLETED via webhook.")
        return Response({"status": "updated", "job_id": job_id}, status=status.HTTP_200_OK)


class CustomImporterViewSet(ImporterViewSet):
    """Allows anonymous upload calls during AI-worker uploads back to GeoNode."""
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        if not request.user or request.user.is_anonymous:
            request.user = User.objects.filter(is_superuser=True).first()
        return super().create(request, *args, **kwargs)