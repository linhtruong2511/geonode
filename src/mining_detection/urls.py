"""
mining_detection/urls.py — URL routing cho Django template views
"""

from django.urls import path
from . import template_views, views
from .views import UploadExecution, UploadResultDetection
from django.views.decorators.csrf import csrf_exempt

app_name = "mining_detection"

urlpatterns = [
    # List tất cả jobs
    path(
        "",
        template_views.JobListView.as_view(),
        name="job_list",
    ),
    # Form tạo job mới
    path(
        "new/",
        template_views.JobCreateView.as_view(),
        name="job_create",
    ),
    # Chi tiết một job
    path(
        "<int:pk>/",
        template_views.JobDetailView.as_view(),
        name="job_detail",
    ),
    # AJAX: polling trạng thái
    path(
        "<int:pk>/status/",
        template_views.job_status_api,
        name="job_status_api",
    ),
    # Retry job FAILED
    path(
        "<int:pk>/retry/",
        template_views.job_retry_view,
        name="job_retry",
    ),
    
    path(
        "<str:execution_id>/upload-result",
        UploadExecution.as_view()
    ),
    
    path(
        "upload",
        csrf_exempt(UploadResultDetection.as_view({'post': 'create'}))
    ),
]

# ──────────────────────────────────────────────────────────────────────────────
# Thêm vào urls.py chính của GeoNode project:
# ──────────────────────────────────────────────────────────────────────────────
# Trong geonode/urls.py hoặc project urls.py:
#
#   from django.urls import path, include
#
#   urlpatterns += [
#       path("mining-detection/", include("mining_detection.urls", namespace="mining_detection")),
#   ]
#
# Kết quả:
#   /mining-detection/            → danh sách jobs
#   /mining-detection/new/        → tạo job mới
#   /mining-detection/<pk>/       → chi tiết job
#   /mining-detection/<pk>/status/ → AJAX polling
#   /mining-detection/<pk>/retry/  → retry job
# ──────────────────────────────────────────────────────────────────────────────
