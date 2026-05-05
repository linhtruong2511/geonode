# Kế Hoạch Triển Khai App CO2 Management (Final)

## Bối cảnh

Triển khai Django app `co2_management` trên nền tảng GeoNode hiện có. App hiện chỉ có skeleton files trống.

**Quyết định đã xác nhận:**
- ✅ Schema mới hoàn toàn theo `schema.md` — không liên quan đến `carbon_tracker` (app thử nghiệm)
- ✅ REST API only (DRF) — React sẽ được nghiên cứu sau
- ✅ Tận dụng Celery setup hiện có (`geonode_project/celeryapp.py`)
- ✅ Thư viện `h5py`, `xarray`, `djangorestframework-gis` đã có sẵn trong GeoNode
- ✅ User & phân quyền dùng GeoNode built-in (`settings.AUTH_USER_MODEL`)
- ✅ Database: PostgreSQL/PostGIS
- ✅ File mẫu `.nc4`, `.h5` giữ nguyên trong thư mục app để test

---

## Proposed Changes

### Phase 1: Models & Database

#### [MODIFY] [models.py](file:///usr/src/project/co2_management/models.py)

12 models theo `schema.md`, sử dụng `django.contrib.gis.db.models`:

| # | Model | Quan hệ | Ghi chú |
|---|-------|---------|---------|
| 1 | `Satellite` | — | `satellite_name`, `operator`, `is_active`, orbital params |
| 2 | `SatelliteInstrument` | FK → `Satellite` | `instrument_name`, spectral bands, resolution |
| 3 | `MeasurementSource` | FK → `Satellite` | File .nc4/.h5, `file_hash` UNIQUE, `processing_level` |
| 4 | `MeasurementMetadata` | OneToOne → `MeasurementSource` | min/max/mean XCO2, coverage stats |
| 5 | `Measurement` | FK → `MeasurementSource` | **Core table**. BIGINT PK, `PointField(srid=4326)`, `xco2_ppm`, `GistIndex` trên geom |
| 6 | `VerticalProfile` | FK → `Measurement` | `level_index` (1-20), `co2_concentration_ppm`, `pressure_hpa` |
| 7 | `QualityAssessment` | OneToOne → `Measurement` | `quality_score` 0-100, `validation_flags` JSONField |
| 8 | `MonitoringLocation` | — | `PointField`, `radius_km`, `location_type` TextChoices |
| 9 | `TemporalSeries` | FK → `MonitoringLocation`, FK → `Measurement` | Denormalized time series |
| 10 | `DataComparison` | FK × 2 → `Measurement` | `oco2_measurement`, `gosat2_measurement`, `xco2_difference_ppm` |
| 11 | `AnalysisJob` | FK → `settings.AUTH_USER_MODEL` | `status` TextChoices (pending/running/completed/failed), `parameters` JSON |
| 12 | `AuditLog` | FK → `settings.AUTH_USER_MODEL` | `action`, `table_name`, `old_value`/`new_value` JSON |

**Enums (TextChoices):**
- `DataSourceType`: `OCO2`, `GOSAT2`
- `FileFormatType`: `NETCDF4`, `HDF5`
- `LocationType`: `CITY`, `REGION`, `INDUSTRIAL`, `RESEARCH`
- `JobType`: `COMPARISON`, `TREND`, `ANOMALY`, `EXPORT`
- `JobStatus`: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- `ComparisonType`: `SPATIAL`, `TEMPORAL`, `RANDOM`
- `AuditAction`: `INSERT`, `UPDATE`, `DELETE`, `QUERY`

---

### Phase 2: Admin Interface

#### [MODIFY] [admin.py](file:///usr/src/project/co2_management/admin.py)

| Admin Class | Features |
|------------|----------|
| `SatelliteAdmin` | Inline `SatelliteInstrumentInline`, `list_display`, `list_filter` |
| `MeasurementSourceAdmin` | `list_filter` (satellite, format, quality_checked), `search_fields` (file_name) |
| `MeasurementAdmin` | `list_filter` (data_source, quality_flag), `readonly_fields` (geom), `date_hierarchy` |
| `MonitoringLocationAdmin` | `list_filter` (location_type, is_active), `search_fields` |
| `AnalysisJobAdmin` | `list_filter` (status, job_type), `readonly_fields` (progress, result) |
| `AuditLogAdmin` | Fully readonly, `list_filter` (action, table_name), `date_hierarchy` |

---

### Phase 3: REST API (DRF)

#### [NEW] [serializers.py](file:///usr/src/project/co2_management/serializers.py)

Serializers cho tất cả models:
- `SatelliteSerializer` — nested instruments
- `MeasurementSourceSerializer` — nested metadata
- `MeasurementSerializer` — nested profiles & quality assessment
- `MeasurementListSerializer` — lightweight cho list view (không nested)
- `MonitoringLocationSerializer`
- `DataComparisonSerializer`
- `AnalysisJobSerializer` — create (writable) + read (với result summary)
- `AuditLogSerializer` — readonly

#### [MODIFY] [views.py](file:///usr/src/project/co2_management/views.py)

DRF ViewSets:

| ViewSet | Methods | Custom Actions |
|---------|---------|---------------|
| `SatelliteViewSet` | list, retrieve | — |
| `MeasurementSourceViewSet` | list, retrieve | `upload` (POST file) |
| `MeasurementViewSet` | list, retrieve | `spatial_query` (GET with bbox/radius params) |
| `MonitoringLocationViewSet` | CRUD | `timeseries` (GET), `statistics` (GET) |
| `DataComparisonViewSet` | list, retrieve | `generate` (POST), `report` (GET) |
| `AnalysisJobViewSet` | list, retrieve, create | `cancel` (POST) |

Permissions: Dùng GeoNode permissions — `IsAuthenticated` cho write, public cho read.

#### [NEW] [api_urls.py](file:///usr/src/project/co2_management/api_urls.py)

```python
# DRF Router → /api/v1/co2/
router.register('satellites', SatelliteViewSet)
router.register('sources', MeasurementSourceViewSet)
router.register('measurements', MeasurementViewSet)
router.register('locations', MonitoringLocationViewSet)
router.register('comparisons', DataComparisonViewSet)
router.register('jobs', AnalysisJobViewSet)
```

#### [NEW] [urls.py](file:///usr/src/project/co2_management/urls.py)

Include `api_urls` under `api/v1/co2/` prefix.

---

### Phase 4: Data Import & Celery Tasks

#### [NEW] [services/__init__.py](file:///usr/src/project/co2_management/services/__init__.py)
#### [NEW] [services/oco2_parser.py](file:///usr/src/project/co2_management/services/oco2_parser.py)

Parse file `.nc4` bằng `xarray`:
- Extract `xco2`, `latitude`, `longitude`, `time`, `xco2_quality_flag`
- Extract vertical profiles (20 levels)
- Return list of dicts → bulk_create `Measurement` + `VerticalProfile`

#### [NEW] [services/gosat2_parser.py](file:///usr/src/project/co2_management/services/gosat2_parser.py)

Parse file `.h5` bằng `h5py`:
- Extract sounding data, XCO2, geometry
- Extract profile layers (15 levels)
- Return list of dicts → bulk_create

#### [NEW] [services/import_service.py](file:///usr/src/project/co2_management/services/import_service.py)

Orchestrate import pipeline:
```
1. Validate file (format, hash duplicate check)
2. Create MeasurementSource record
3. Dispatch to oco2_parser or gosat2_parser
4. bulk_create Measurements + VerticalProfiles
5. Run quality checks → create QualityAssessments
6. Calculate & create MeasurementMetadata
7. Mark source.quality_checked = True
```

#### [NEW] [services/comparison_service.py](file:///usr/src/project/co2_management/services/comparison_service.py)

- Find OCO-2/GOSAT-2 pairs within spatial (<50km) and temporal (<1h) thresholds
- Calculate XCO2 differences
- bulk_create `DataComparison` records

#### [NEW] [services/quality_service.py](file:///usr/src/project/co2_management/services/quality_service.py)

- Cloud check, SNR check, pressure check
- Calculate quality_score (0-100)
- Generate validation_flags JSON

#### [NEW] [tasks.py](file:///usr/src/project/co2_management/tasks.py)

Celery tasks tận dụng `geonode_project/celeryapp.py`:

```python
@app.task(bind=True)
def import_data_file_task(self, source_id):
    """Async import .nc4/.h5 file"""

@app.task(bind=True)
def run_comparison_task(self, job_id):
    """Async OCO-2 vs GOSAT-2 comparison"""

@app.task(bind=True)
def run_analysis_job_task(self, job_id):
    """Generic async analysis dispatcher"""
```

---

### Phase 5: Integration

#### [MODIFY] [settings.py](file:///usr/src/project/geonode_project/settings.py)

```python
# Line 52-57: Thêm 'co2_management' vào INSTALLED_APPS
if PROJECT_NAME not in INSTALLED_APPS:
    INSTALLED_APPS += (
        PROJECT_NAME,
        'mining_detection',
        'carbon_tracker',
        'co2_management',  # ← NEW
    )

# Line 102-110: Thêm logger
'loggers': {
    'mining_detection': { ... },
    'co2_management': {        # ← NEW
        'handlers': ['console'],
        'level': 'DEBUG',
        'propagate': True,
    },
},
```

#### [MODIFY] [urls.py](file:///usr/src/project/geonode_project/urls.py)

```python
# Line 28-33: Thêm co2 URL
urlpatterns += [
    path("mining-detection/", include("mining_detection.urls", namespace="mining_detection")),
    path("carbon-tracker/", include("carbon_tracker.urls")),
    path("co2/", include("co2_management.urls")),  # ← NEW
    path('api/v2/', include('mining_detection.api_urls')),
]
```

---

### Phase 6: Tests

#### [MODIFY] [tests.py](file:///usr/src/project/co2_management/tests.py)

| Test Class | Tests |
|-----------|-------|
| `ModelCreationTests` | Tạo & verify tất cả 12 models, relationships, constraints |
| `OCO2ParserTests` | Parse file `.nc4` mẫu, verify measurement count & data |
| `GOSAT2ParserTests` | Parse file `.h5` mẫu, verify sounding data |
| `ImportPipelineTests` | End-to-end import: file → DB → metadata → quality |
| `APITests` | CRUD endpoints, spatial query, upload |
| `ComparisonTests` | Pair matching, difference calculation |

---

## Verification Plan

### Automated
```bash
python manage.py makemigrations co2_management
python manage.py migrate
python manage.py test co2_management -v 2
python manage.py shell -c "from co2_management.models import *; print('OK')"
```

### Manual
- Import file `.nc4` mẫu qua API → verify trong admin
- Import file `.h5` mẫu qua API → verify trong admin
- Test spatial query: tìm measurements gần Hà Nội (21.02°N, 105.84°E)
- Test comparison generation giữa OCO-2 và GOSAT-2

---

## Thứ Tự Triển Khai

```
Phase 1 (Models) → Phase 5 (Integration/Settings) → makemigrations/migrate
    → Phase 2 (Admin) → verify trong Django admin
    → Phase 3 (API) → test endpoints
    → Phase 4 (Services/Tasks) → test import pipeline
    → Phase 6 (Tests) → chạy full test suite
```
