"""
mining_detection/views.py

ViewSets theo style của GeoNode's ResourceBase API (DRF + drf-gis).
Permission tích hợp với GeoNode's permission system.
"""
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.views import APIView
from geonode.resource.models import ExecutionRequest
from .tasks import get_dataset_from_execution_id, get_monitoring_dataset_from_execution_id
from .models import JobStatus, MiningDetectionJob
from .serializers import (
    MiningDetectionJobCreateSerializer,
    MiningDetectionJobDetailSerializer,
    MiningDetectionJobListSerializer,
)
from .tasks import sync_job
from geonode.upload.api.views import ImporterViewSet
import logging

import logging
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.permissions import IsAuthenticatedOrReadOnly, AllowAny
from rest_framework.response import Response
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.contrib.sessions.models import Session
from django.contrib.auth import get_user_model
from .tasks import save_result_job
from rest_framework.pagination import PageNumberPagination
User = get_user_model()
logger = logging.getLogger(__name__)

class MiningDetectionJobViewSet(viewsets.ModelViewSet):
    """
    ViewSet quản lý MiningDetectionJob.

    list:   GET  /api/v2/mining-jobs/
    create: POST /api/v2/mining-jobs/
    update: PUT  /api/v2/mining-jobs/{job_id}/
    detail: GET  /api/v2/mining-jobs/{id}/
    retry:  POST /api/v2/mining-jobs/{id}/retry/
    stats:  GET  /api/v2/mining-jobs/aggregate-stats/
    notify-complete: POST /api/v2/mining-jobs/notify-complete/
    """

    queryset = MiningDetectionJob.objects.select_related(
        "result_dataset", "statistics", "created_by"
    ).order_by("-created_at")
    
    pagination_class = PageNumberPagination
    paginate_by = 10
    
    
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "model_version", "created_by"]
    search_fields = ["title", "job_id"]
    ordering_fields = ["created_at", "completed_at", "status"]

    def get_serializer_class(self):
        if self.action == "create":
            return MiningDetectionJobCreateSerializer
        if self.action in ("retrieve", "update", "partial_update"):
            return MiningDetectionJobDetailSerializer
        return MiningDetectionJobListSerializer

    def perform_create(self, serializer):
        job = serializer.save(created_by=self.request.user)
        # Kích hoạt Celery task để submit và poll job
        sync_job.delay(job.pk)

    @action(detail=False, methods=["post"])
    def notify_complete(self, request):
        """API endpoint để AI service gọi khi job đã hoàn thành."""
        job_id = request.data.get("job_id")
        job = MiningDetectionJob.objects.get(job_id = job_id)
        if not job: 
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)
        if job.status != JobStatus.COMPLETED:
            save_result_job(job)
            return Response({"detail": "Job result fetched and saved."})
        else:
            return Response({"detail": "Job already marked as COMPLETED."})

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        """Thử lại job đã FAILED."""
        job = self.get_object()
        if job.status != JobStatus.FAILED:
            return Response(
                {"detail": "Chỉ có thể retry job ở trạng thái FAILED."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job.status = JobStatus.PENDING
        job.error_message = ""
        job.poll_count = 0
        job.save(update_fields=["status", "error_message", "poll_count", "updated_at"])
        sync_job.delay(job.pk)
        return Response({"detail": "Job đã được retry.", "job_id": str(job.job_id)})

    @action(detail=False, methods=["get"])
    def aggregate_stats(self, request):
        """
        Thống kê tổng hợp toàn bộ jobs.
        GET /api/v2/mining-jobs/aggregate-stats/
        """
        from django.db.models import Avg, Count, Sum
        from .models import InferenceStatistics

        qs = InferenceStatistics.objects.filter(job__created_by=request.user)
        data = qs.aggregate(
            total_jobs=Count("job"),
            total_area_ha=Sum("total_area_ha"),
            total_detections=Sum("count"),
            avg_ndvi=Avg("avg_ndvi"),
            avg_bsi=Avg("avg_bsi"),
        )

        # Thêm breakdown theo status
        status_counts = (
            MiningDetectionJob.objects
            .filter(created_by=request.user)
            .values("status")
            .annotate(count=Count("id"))
        )
        data["status_breakdown"] = {r["status"]: r["count"] for r in status_counts}

        return Response(data)

    @action(detail=True, methods=["get"])
    def geonode_layer(self, request, pk=None):
        """
        Trả về metadata của GeoNode Dataset liên kết với job.
        GET /api/v2/mining-jobs/{id}/geonode-layer/
        Dùng GeoNode's built-in Dataset serializer để đảm bảo nhất quán.
        """
        job = self.get_object()
        if not job.result_dataset:
            return Response(
                {"detail": "Job chưa có layer kết quả."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Dùng GeoNode's own API URL để redirect — không double-serialize
        dataset = job.result_dataset
        geonode_url = f"/api/v2/datasets/{dataset.pk}/"
        return Response({
            "dataset_pk": dataset.pk,
            "alternate": dataset.alternate,
            "typename": dataset.typename,
            "title": dataset.title,
            "geonode_api_url": request.build_absolute_uri(geonode_url),
            "wms_url": getattr(dataset, "ows_url", None),
        })
        
class UploadExecution(APIView): 
    def get(self, request, execution_id):
        try:
            execution_req = ExecutionRequest.objects.get(exec_id=execution_id)
            return Response(execution_req.output_params, 200)
            
        except:
            return Response("Eror: Execution id không hợp lệ", 400)
 
@method_decorator(csrf_exempt, name='dispatch')
class UploadSentinelData(ImporterViewSet):
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        user_id = request.data.get('user_id')
        site_id = request.data.get('site_id')
        if not user_id:
            return Response(
                {"detail": "Missing user_id."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Inject user nếu request anonymous
        if request.user.is_anonymous:
            user = User.objects.get(pk=user_id)
            if user is None:
                logger.error(f"Invalid user_id={user_id}")
                return Response(
                    {"detail": "Invalid user."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            request._request.user = user  # inject vào Django request gốc
            request.user = user           # inject vào DRF request wrapper

        logger.info(f"Upload sentinel data by user={request.user}")

        response = super().create(request, *args, **kwargs)
        if response.status_code in [200, 201]:
            logger.info(f"Sentinel data upload created with execution_id={response.data.get('execution_id')}")
            execution_id = response.data.get('execution_id')
            if execution_id and site_id:
                get_monitoring_dataset_from_execution_id.apply_async(
                    args=[execution_id, site_id, user_id], queue='default'
                ) 
            else:
                logger.warning(f"Missing execution_id or site_id for monitoring dataset linking: execution_id={execution_id}, site_id={site_id}")
        return response 

@method_decorator(csrf_exempt, name='dispatch')
class UploadResultDetection(ImporterViewSet):
    permission_classes = [AllowAny]

    def get_user_from_session(self, session_key):  # thêm self
        try:
            session = Session.objects.get(session_key=session_key)
            uid = session.get_decoded().get('_auth_user_id')
            return User.objects.get(pk=uid)
        except (Session.DoesNotExist, User.DoesNotExist):
            return None

    def create(self, request, *args, **kwargs):
        job_id = request.data.get('job_id')
        session_id = request.data.get('session_id')

        if not job_id:
            return Response(
                {"detail": "Missing job_id."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Inject user nếu request anonymous
        if request.user.is_anonymous:
            if not session_id:
                return Response(
                    {"detail": "session_id is required."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            user = self.get_user_from_session(session_id)
            if user is None:
                logger.error(f"Invalid session_id={session_id} for job_id={job_id}")
                return Response(
                    {"detail": "Invalid session."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            request._request.user = user  # inject vào Django request gốc
            request.user = user           # inject vào DRF request wrapper

        logger.info(f"Upload job_id={job_id} by user={request.user}")

        response = super().create(request, *args, **kwargs)
        if response.status_code == 201:
            execution_id = response.data.get('execution_id')
            get_dataset_from_execution_id.apply_async(
                args=[job_id, execution_id], queue='default'
            )
        return response
