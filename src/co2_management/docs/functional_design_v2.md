# 🛰️ Thiết Kế Chức Năng v2: CO2 Management System

## 📋 Mục Lục
1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Trạng Thái Triển Khai Hiện Tại](#2-trạng-thái-triển-khai-hiện-tại)
3. [Phân Tích Khoảng Trống (Gap Analysis)](#3-phân-tích-khoảng-trống)
4. [Kế Hoạch Triển Khai (Action Plan)](#4-kế-hoạch-triển-khai)
5. [Chi Tiết Từng Phase](#5-chi-tiết-từng-phase)
6. [Khuyến Nghị Kỹ Thuật](#6-khuyến-nghị-kỹ-thuật)

---

## 1. Tổng Quan Hệ Thống

Hệ thống quản lý, phân tích và đối chiếu dữ liệu CO2 từ vệ tinh **OCO-2** (NASA) và **GOSAT-2** (JAXA) trên nền tảng Django/GeoNode. Mục tiêu cốt lõi là cung cấp khả năng lưu trữ không gian (PostGIS), phân tích chuỗi thời gian, và đánh giá chéo (cross-validation) để phục vụ nghiên cứu môi trường.

---

## 2. Trạng Thái Triển Khai Hiện Tại

### ✅ Đã Hoàn Thành

| Thành phần | File | Trạng thái |
|---|---|---|
| Domain Models (12 models) | `models.py` | ✅ Hoàn chỉnh |
| API ViewSets cơ bản | `views.py` | ✅ Skeleton đầy đủ |
| Serializers | `serializers.py` | ✅ Hoàn chỉnh |
| URL routing | `urls.py`, `api_urls.py` | ✅ Hoàn chỉnh |
| Template Views (CRUD) | `template_views.py` | ✅ ~617 dòng |
| OCO-2 Parser | `services/oco2_parser.py` | ✅ Hoàn chỉnh |
| GOSAT-2 Parser | `services/gosat2_parser.py` | ✅ Hoàn chỉnh |
| Import Service | `services/import_service.py` | ✅ Hoàn chỉnh |
| Comparison Service | `services/comparison_service.py` | ✅ Có Co-location logic |
| Quality Service | `services/quality_service.py` | ✅ Hoàn chỉnh |
| Celery Tasks (3 tasks) | `tasks.py` | ✅ Cơ bản |
| Admin Interface | `admin.py` | ✅ Đăng ký models |
| Templates (13 file) | `templates/co2_management/` | ✅ Đầy đủ màn hình |
| Soft Delete cho Measurement | `models.py` (`deleted_at`) | ✅ |
| Composite Index | `models.py` (Meta.indexes) | ✅ |

### ⚠️ Tồn Tại Lỗi / Không Nhất Quán

| # | Vấn đề | Vị trí | Ảnh hưởng |
|---|---|---|---|
| 1 | `LocationListView.search_fields = ["name"]` — field không tồn tại | `template_views.py:415` | Lỗi runtime khi search |
| 2 | `JobListView` dùng `"created_at"` và `"progress_percentage"` — không có trong model | `template_views.py:555-556` | Lỗi template render |
| 3 | `JobDetailView.detail_fields` dùng `"started_at"`, `"finished_at"`, `"created_by.username"` — không có trong model | `template_views.py:599-601` | Lỗi template render |
| 4 | `AuditLogListView` dùng `"model_name"`, `"object_id"`, `"timestamp"` — không có trong `AuditLog` model | `template_views.py:609-616` | Lỗi template render |
| 5 | `ComparisonListView` dùng `"matched_pairs_count"`, `"mean_bias_ppm"`, `"rmse_ppm"`, `"correlation_coefficient"` — không có trong `DataComparison` model | `template_views.py:491-496` | Lỗi template render |
| 6 | `LocationCreateView.fields = ["name", ...]` — field đúng là `"location_name"` | `template_views.py:431` | Form validation lỗi |
| 7 | `AnalysisJob` thiếu fields: `created_at`, `celery_task_id`, `started_at`, `finished_at` | `models.py` | Tính năng job management không hoàn chỉnh |
| 8 | `DataComparison` thiếu các trường thống kê tổng hợp theo job | `models.py` | ComparisonReport không render được |
| 9 | `comparison_service.py` lặp từng OCO-2 điểm → O(N×M) — sẽ chậm với dữ liệu lớn | `services/comparison_service.py:65` | Hiệu năng |
| 10 | `DashboardView.get_map_config()` build URL sai (`"measurement-list"` + `"spatial_query/"`) | `template_views.py:205` | Bản đồ dashboard không load |

---

## 3. Phân Tích Khoảng Trống

### Chức năng thiếu hoàn toàn
- **F6.3 - Cancel Job**: `cancel` action trả về stub, chưa revoke Celery task
- **Heatmap API**: `spatial_query` action chưa chuẩn hóa intensity cho heatmap
- **Export Job**: `job_type=EXPORT` chưa được implement trong `run_analysis_job_task`
- **Trend Analysis**: `job_type=TREND` trả về FAILED ngay lập tức
- **TemporalSeries population**: Không có cơ chế tự động populate sau import

### Chức năng có skeleton nhưng chưa hoạt động
- `DataComparisonViewSet.generate()` — stub
- `DataComparisonViewSet.report()` — stub  
- `MeasurementSourceViewSet.upload()` — stub

---

## 4. Kế Hoạch Triển Khai

### Ưu tiên theo mức độ quan trọng

```
Phase A (BUG FIX — Bắt buộc trước): Sửa các lỗi field không tồn tại
Phase B (Model Extension): Thêm fields còn thiếu vào models
Phase C (API Completion): Hoàn thiện các API endpoint còn là stub
Phase D (UI Enhancement): Cải thiện templates và UX
Phase E (Performance): Tối ưu hóa và refactor
```

---

## 5. Chi Tiết Từng Phase

### Phase A: Bug Fix (Ưu tiên P0 — Làm ngay)

#### A1. Sửa `models.py` — Thêm fields còn thiếu vào `AnalysisJob`

```python
class AnalysisJob(models.Model):
    # Các fields hiện tại giữ nguyên...
    # Thêm:
    celery_task_id = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
```

#### A2. Sửa `template_views.py` — Đồng bộ field names với models

**`LocationListView`**: Đổi `search_fields = ["location_name"]`

**`LocationCreateView`**: Đổi fields thành `["location_name", "location_type", "latitude", "longitude", "radius_km"]` và thêm `save()` override để tính `geom` từ lat/lon.

**`JobListView`**: Sửa `table_columns`:
```python
table_columns = [
    (_("Tên Job"), "job_name"),
    (_("Loại"), "job_type"),
    (_("Trạng thái"), "status"),
    (_("Ngày tạo"), "created_at"),       # thêm field vào model
    (_("Tiến trình"), lambda obj: f"{obj.progress_percent}%"),  # đổi tên
]
```

**`JobDetailView`**: Sửa detail_fields:
```python
detail_fields = [
    (_("Tên"), "job_name"),
    (_("Loại"), "job_type"),
    (_("Trạng thái"), "status"),
    (_("Tiến trình"), lambda obj: f"{obj.progress_percent}%"),
    (_("Bắt đầu"), "started_at"),
    (_("Kết thúc"), "finished_at"),
    (_("Người tạo"), "user.username"),
]
```

**`AuditLogListView`**: Sửa `table_columns` và `search_fields` để dùng đúng fields của `AuditLog` model: (`created_at`, `action`, `table_name`, `user__username`)

**`ComparisonListView`**: Đổi thành hiển thị theo từng `DataComparison` record với fields thực tế.

**`DashboardView.get_map_config()`**: Sửa URL:
```python
"data_url": reverse("co2_management:measurement-list") + "spatial_query/?limit=500"
# Đổi thành:
"data_url": "/co2/api/v1/measurements/spatial_query/?limit=500"
```

#### A3. Migration

```bash
python manage.py makemigrations co2_management --name="add_job_tracking_fields"
python manage.py migrate
```

---

### Phase B: API Completion (Ưu tiên P1)

#### B1. Hoàn thiện `DataComparisonViewSet.generate()`

```python
@action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
def generate(self, request):
    """
    Tạo AnalysisJob loại COMPARISON và enqueue Celery task.
    Body: { "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD",
            "max_distance_km": 50, "max_time_diff_hours": 2 }
    """
    job = AnalysisJob.objects.create(
        user=request.user,
        job_name=f"Comparison {now().date()}",
        job_type='COMPARISON',
        parameters=request.data
    )
    from .tasks import run_comparison_task
    task = run_comparison_task.delay(job.pk)
    job.celery_task_id = task.id
    job.save()
    return Response({"job_id": job.pk, "status": "PENDING"}, status=201)
```

#### B2. Hoàn thiện `DataComparisonViewSet.report()`

```python
@action(detail=False, methods=['get'])
def report(self, request):
    """
    Trả về thống kê bias, RMSE, correlation theo job_id (tùy chọn).
    Query param: ?job_id=<int>
    """
    import numpy as np
    job_id = request.query_params.get('job_id')
    qs = DataComparison.objects.all()
    if job_id:
        qs = qs.filter(job_id=job_id)
    
    diffs = list(qs.values_list('xco2_difference_ppm', flat=True))
    if not diffs:
        return Response({"error": "Không có dữ liệu so sánh."}, status=404)
    
    arr = np.array(diffs)
    return Response({
        "total_pairs": len(arr),
        "bias_ppm": round(float(np.mean(arr)), 4),
        "rmse_ppm": round(float(np.sqrt(np.mean(arr**2))), 4),
        "std_ppm": round(float(np.std(arr)), 4),
    })
```

#### B3. Hoàn thiện `AnalysisJobViewSet.cancel()`

```python
@action(detail=True, methods=['post'])
def cancel(self, request, pk=None):
    """Hủy Celery task và cập nhật trạng thái job."""
    from celery.app.control import Control
    from geonode_project.celeryapp import app as celery_app
    
    job = self.get_object()
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        return Response({"error": "Job đã kết thúc, không thể hủy."}, status=400)
    
    if job.celery_task_id:
        celery_app.control.revoke(job.celery_task_id, terminate=True)
    
    job.status = JobStatus.FAILED
    job.error_message = "Hủy bởi người dùng."
    job.save()
    return Response({"status": "CANCELLED"})
```

#### B4. Thêm Heatmap action vào `MeasurementViewSet`

```python
@action(detail=False, methods=['get'])
def heatmap(self, request):
    """
    Trả về dữ liệu heatmap: mảng [lat, lon, intensity].
    intensity được chuẩn hóa về [0, 1] dựa trên min/max XCO2.
    Query params: source, date_from, date_to, min_lat/max_lat/min_lon/max_lon, limit
    """
    qs = self.get_queryset().filter(xco2_quality_flag=0)
    limit = int(request.query_params.get('limit', 2000))
    qs = qs.values('latitude', 'longitude', 'xco2_ppm')[:limit]
    
    points = list(qs)
    if not points:
        return Response([])
    
    xco2_values = [p['xco2_ppm'] for p in points]
    min_val, max_val = min(xco2_values), max(xco2_values)
    span = max_val - min_val or 1
    
    data = [
        [p['latitude'], p['longitude'], round((p['xco2_ppm'] - min_val) / span, 3)]
        for p in points
    ]
    return Response(data)
```

---

### Phase C: Task Enhancements (Ưu tiên P1)

#### C1. Cập nhật `tasks.py` — Tracking started_at, finished_at

```python
@shared_task(bind=True)
def run_comparison_task(self, job_id):
    from django.utils import timezone
    from .models import AnalysisJob, JobStatus
    from .services.comparison_service import ComparisonService
    
    try:
        job = AnalysisJob.objects.get(pk=job_id)
        job.status = JobStatus.RUNNING
        job.started_at = timezone.now()
        job.save()
        
        ComparisonService().run_comparison(job_id)
        
        job.refresh_from_db()
        job.finished_at = timezone.now()
        job.save()
    except Exception as exc:
        job = AnalysisJob.objects.filter(pk=job_id).first()
        if job:
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            job.finished_at = timezone.now()
            job.save()
        raise
```

#### C2. Thêm task `populate_temporal_series`

```python
@shared_task
def populate_temporal_series_for_location(location_id):
    """
    Sau khi import dữ liệu mới, populate TemporalSeries cho một vị trí giám sát.
    Sử dụng PostGIS distance_lte để tìm measurements trong bán kính của location.
    """
    from django.contrib.gis.measure import D
    from .models import MonitoringLocation, Measurement, TemporalSeries
    
    location = MonitoringLocation.objects.get(pk=location_id)
    
    # Xóa bản ghi cũ (full refresh)
    TemporalSeries.objects.filter(location=location).delete()
    
    # Tìm measurements trong bán kính
    measurements = Measurement.objects.filter(
        geom__distance_lte=(location.geom, D(km=location.radius_km)),
        deleted_at__isnull=True
    )
    
    # Bulk create TemporalSeries
    series_list = [
        TemporalSeries(
            location=location,
            measurement=m,
            measurement_date=m.measurement_time.date(),
            xco2_ppm=m.xco2_ppm,
            data_source=m.data_source,
        )
        for m in measurements
    ]
    TemporalSeries.objects.bulk_create(series_list, ignore_conflicts=True)
```

#### C3. Thêm task `export_measurements_job`

```python
@shared_task(bind=True)
def export_measurements_job(self, job_id):
    """
    Xuất dữ liệu Measurement ra file CSV theo params trong job.parameters.
    Lưu file vào MEDIA_ROOT/co2_exports/.
    """
    import csv, os
    from django.conf import settings
    from django.utils import timezone
    from .models import AnalysisJob, Measurement, JobStatus
    
    job = AnalysisJob.objects.get(pk=job_id)
    job.status = JobStatus.RUNNING
    job.started_at = timezone.now()
    job.save()
    
    params = job.parameters
    qs = Measurement.objects.filter(deleted_at__isnull=True)
    if params.get('source'):
        qs = qs.filter(data_source=params['source'])
    if params.get('date_from'):
        qs = qs.filter(measurement_time__date__gte=params['date_from'])
    if params.get('date_to'):
        qs = qs.filter(measurement_time__date__lte=params['date_to'])
    if params.get('quality_only'):
        qs = qs.filter(xco2_quality_flag=0)
    
    export_dir = os.path.join(settings.MEDIA_ROOT, 'co2_exports')
    os.makedirs(export_dir, exist_ok=True)
    file_path = os.path.join(export_dir, f"export_job_{job_id}.csv")
    
    with open(file_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'data_source', 'latitude', 'longitude',
                         'xco2_ppm', 'xco2_quality_flag', 'measurement_time'])
        for m in qs.iterator(chunk_size=5000):
            writer.writerow([m.id, m.data_source, m.latitude, m.longitude,
                             m.xco2_ppm, m.xco2_quality_flag, m.measurement_time])
    
    job.status = JobStatus.COMPLETED
    job.result_path = file_path
    job.finished_at = timezone.now()
    job.save()
```

---

### Phase D: UI Enhancement (Ưu tiên P2)

#### D1. Cải thiện `DashboardView` — Thêm biểu đồ thống kê

Bổ sung context cho dashboard:
```python
def get_context_data(self, **kwargs):
    context = super().get_context_data(**kwargs)
    # Thêm thống kê theo nguồn
    from django.db.models import Count
    context["stats_by_source"] = list(
        Measurement.objects.filter(deleted_at__isnull=True)
        .values('data_source')
        .annotate(total=Count('id'))
    )
    context["jobs_by_status"] = list(
        AnalysisJob.objects.values('status').annotate(total=Count('id'))
    )
    # ... existing stats
```

#### D2. Thêm trang `job_detail.html` với Progress Bar

Template hiện tại quá đơn giản. Cần bổ sung:
- Progress bar hiển thị `progress_percent`
- Nút "Hủy job" (gọi cancel API)
- Link tải file kết quả nếu `result_path` tồn tại
- Hiển thị `error_message` nếu job FAILED

#### D3. Thêm trang `comparison_create.html`

Form để tạo Comparison Job với:
- Chọn khoảng thời gian (`date_from`, `date_to`)
- Slider chọn `max_distance_km` (default 50)
- Slider chọn `max_time_diff_hours` (default 2)

#### D4. Sửa `co2_base.html` — Sidebar navigation

Kiểm tra và đảm bảo `active_section` khớp với tất cả view mới.

---

### Phase E: Performance & Refactor (Ưu tiên P3)

#### E1. Tối ưu `ComparisonService` — Batch Query

Thay vì lặp từng OCO-2 điểm (O(N×M)), chuyển sang **spatial join** tại DB level:

```python
# Chiến lược mới: dùng raw SQL hoặc Django ORM spatial join
# Chia OCO-2 points theo ngày → với mỗi ngày, JOIN với GOSAT-2 cùng ngày ± 2 giờ
# Sử dụng DWithin trong subquery thay vì nested Python loop

from django.db import connection

def run_comparison_bulk(self, job_id, max_distance_km=50, max_time_diff_hours=2):
    """Spatial join tại DB — hiệu quả hơn O(N) lần so với Python loop"""
    with connection.cursor() as cursor:
        cursor.execute("""
            INSERT INTO co2_management_datacomparison
                (job_id, oco2_measurement_id, gosat2_measurement_id,
                 spatial_distance_km, xco2_difference_ppm, comparison_type)
            SELECT
                %s,
                o.id,
                g.id,
                ST_Distance(o.geom::geography, g.geom::geography) / 1000.0,
                o.xco2_ppm - g.xco2_ppm,
                'SPATIAL'
            FROM co2_management_measurement o
            CROSS JOIN LATERAL (
                SELECT id, geom, xco2_ppm
                FROM co2_management_measurement
                WHERE data_source = 'GOSAT2'
                  AND xco2_quality_flag = 0
                  AND deleted_at IS NULL
                  AND measurement_time BETWEEN o.measurement_time - INTERVAL '%s hours'
                                          AND o.measurement_time + INTERVAL '%s hours'
                  AND ST_DWithin(geom::geography, o.geom::geography, %s * 1000)
                LIMIT 1
            ) g
            WHERE o.data_source = 'OCO2'
              AND o.xco2_quality_flag = 0
              AND o.deleted_at IS NULL
        """, [job_id, max_time_diff_hours, max_time_diff_hours, max_distance_km])
```

#### E2. Thêm GIST Index cho `Measurement.geom`

Thêm vào `Meta.indexes`:
```python
class Meta:
    indexes = [
        models.Index(fields=['source', 'measurement_time']),
        models.Index(fields=['data_source', 'xco2_quality_flag', 'xco2_ppm']),
        # Thêm:
        models.Index(fields=['deleted_at']),
    ]
    # GIST index cần tạo qua migration tùy chỉnh:
    # migrations.RunSQL("CREATE INDEX IF NOT EXISTS measurement_geom_gist ON co2_management_measurement USING GIST (geom);")
```

#### E3. Refactor `TemporalSeries` → Materialized View (Dài hạn)

Khi dữ liệu đủ lớn, cân nhắc thay `TemporalSeries` bằng PostgreSQL Materialized View:
```sql
CREATE MATERIALIZED VIEW co2_temporal_series_mv AS
SELECT
    loc.id AS location_id,
    m.measurement_time::date AS measurement_date,
    m.data_source,
    AVG(m.xco2_ppm) AS avg_xco2,
    COUNT(m.id) AS count
FROM co2_management_monitoringlocation loc
JOIN co2_management_measurement m
    ON ST_DWithin(m.geom::geography, loc.geom::geography, loc.radius_km * 1000)
WHERE m.deleted_at IS NULL
GROUP BY loc.id, measurement_date, m.data_source;

CREATE UNIQUE INDEX ON co2_temporal_series_mv (location_id, measurement_date, data_source);
```
Refresh định kỳ bằng Celery beat task.

---

## 6. Khuyến Nghị Kỹ Thuật

### Thứ tự triển khai được đề xuất

```
Phase A (Bug Fix) → Migration → Test thủ công
    → Phase B (API Completion) → Test API với curl/Postman
        → Phase C (Task Enhancements) → Test Celery worker
            → Phase D (UI Enhancement) → Test UI end-to-end
                → Phase E (Performance) → Load test
```

### Checklist triển khai Phase A

- [ ] Thêm `created_at`, `started_at`, `finished_at`, `celery_task_id`, `error_message` vào `AnalysisJob`
- [ ] Tạo và chạy migration
- [ ] Sửa `LocationListView.search_fields`
- [ ] Sửa `LocationCreateView.fields` và xử lý `geom` từ lat/lon
- [ ] Sửa `JobListView.table_columns` dùng `progress_percent`
- [ ] Sửa `JobDetailView.detail_fields` dùng `user.username`
- [ ] Sửa `AuditLogListView` field names
- [ ] Sửa `ComparisonListView` field names
- [ ] Sửa `DashboardView.get_map_config()` URL

### Rủi ro cần lưu ý

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Comparison service chậm với dữ liệu lớn (>1M records) | 🔴 Cao | Phase E1 — Spatial join tại DB |
| TemporalSeries mất đồng bộ sau import | 🟡 Trung bình | Phase C2 — auto-populate task |
| Celery revoke không dừng được task đang chạy | 🟡 Trung bình | Thêm `self.update_state` + check cancelled flag |
| Export file lớn chiếm nhiều disk | 🟢 Thấp | Thêm cleanup task xóa file cũ hơn 7 ngày |

---

*Document Version: 2.1*
*Updated: 2026-05-11*
*Based on: codebase analysis of models.py, views.py, template_views.py, tasks.py, services/*
