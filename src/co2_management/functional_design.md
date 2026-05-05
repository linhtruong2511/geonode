# 🛰️ Thiết Kế Chức Năng: CO2 Management System

## 📋 Mục Lục
1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Phân Tích Schema](#2-phân-tích-schema)
3. [Thiết Kế Module Chức Năng](#3-thiết-kế-module-chức-năng)
4. [API Endpoints](#4-api-endpoints)
5. [Luồng Xử Lý Chính](#5-luồng-xử-lý-chính)
6. [Phân Quyền](#6-phân-quyền)
7. [Khuyến Nghị Cải Thiện Schema](#7-khuyến-nghị-cải-thiện-schema)

---

## 1. Tổng Quan Hệ Thống

### Mục đích
Quản lý, lưu trữ, phân tích và so sánh dữ liệu CO2 từ vệ tinh **OCO-2** (NASA) và **GOSAT-2** (JAXA) trên nền tảng Django/GeoNode.

### Kiến trúc Database
- **14 bảng**, **7 nhóm chức năng**
- Ước tính **~150-200 GB** dữ liệu (bao gồm index)
- Hỗ trợ **61M+ measurements**, **900M+ vertical profiles**

### Công nghệ
- **Backend**: Django + GeoNode
- **Database**: PostgreSQL/PostGIS
- **File formats**: netCDF4 (OCO-2), HDF5 (GOSAT-2)
- **Cache**: Redis cho thống kê XCO2

---

## 2. Phân Tích Schema

### 2.1 Đánh giá tổng thể: ⭐⭐⭐⭐ (4/5)

**Điểm mạnh:**
- ✅ Phân nhóm logic rõ ràng (Infrastructure → Ingestion → Core → Geospatial → Comparison → Analysis → Admin)
- ✅ Spatial indexing chuẩn WGS84 (SRID 4326) với `PointField`
- ✅ Hỗ trợ đa nguồn dữ liệu linh hoạt
- ✅ Partitioning theo tháng cho bảng lớn
- ✅ Audit trail đầy đủ với old/new value JSON
- ✅ Duplicate prevention qua `file_hash` UNIQUE

**Điểm yếu cần khắc phục:**

| # | Vấn đề | Mức độ | Giải pháp |
|---|--------|--------|-----------|
| 1 | MD5 cho mật khẩu | ✅ Đã giải quyết | Dùng GeoNode built-in auth (PBKDF2) |
| 2 | `temporal_series` dữ liệu dư thừa | 🟡 Trung bình | Chuyển thành materialized view |
| 3 | `analysis_jobs.source_ids` dùng JSON | 🟡 Trung bình | Tạo bảng trung gian `analysis_job_sources` |
| 4 | Thiếu soft delete | 🟡 Trung bình | Thêm `deleted_at` cho dữ liệu khoa học |
| 5 | `measurement_metadata` quan hệ 1:1 | 🟢 Nhẹ | Có thể merge vào `measurement_sources` |

---

## 3. Thiết Kế Module Chức Năng

### Module 1: 🛰️ Quản Lý Vệ Tinh (Satellite Management)

**Bảng liên quan:** `satellites`, `satellite_instruments`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F1.1 Xem danh sách vệ tinh | Hiển thị OCO-2, GOSAT-2 với trạng thái | All |
| F1.2 Thêm/sửa vệ tinh | CRUD thông tin vệ tinh | Admin |
| F1.3 Quản lý instruments | CRUD dụng cụ phổ kế trên vệ tinh | Admin |
| F1.4 Xem chi tiết quỹ đạo | Hiển thị altitude, period, inclination | All |

### Module 2: 📊 Nhập Dữ Liệu (Data Ingestion)

**Bảng liên quan:** `measurement_sources`, `measurement_metadata`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F2.1 Upload file dữ liệu | Upload .nc4 (OCO-2) hoặc .h5 (GOSAT-2) | Analyst, Admin |
| F2.2 Validate file | Kiểm tra format, hash, duplicate | System |
| F2.3 Parse & import | Extract measurements từ file → DB | System |
| F2.4 Tính metadata | Tính min/max/mean XCO2, coverage | System |
| F2.5 Xem lịch sử import | Danh sách file đã import, trạng thái | Analyst, Admin |
| F2.6 Re-import file | Import lại file với algorithm version mới | Admin |

**Luồng import:**
```
Upload → Validate hash → Parse file → Insert measurements
→ Insert vertical_profiles → Calculate metadata
→ Quality check → Mark quality_checked = TRUE
```

### Module 3: 🔬 Quản Lý Dữ Liệu Đo Lường (Measurements)

**Bảng liên quan:** `measurements`, `vertical_profiles`, `quality_assessments`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F3.1 Tìm kiếm measurements | Tìm theo vị trí, thời gian, nguồn dữ liệu | All |
| F3.2 Truy vấn spatial | Tìm measurements trong bán kính/polygon | All |
| F3.3 Xem chi tiết measurement | Hiển thị XCO2, tọa độ, quality flags | All |
| F3.4 Xem vertical profile | Biểu đồ CO2 theo chiều cao (15-20 levels) | Analyst |
| F3.5 Lọc theo chất lượng | Filter `xco2_quality_flag = 0` (good data) | All |
| F3.6 Export dữ liệu | Xuất CSV/JSON/GeoJSON theo filter | Analyst |
| F3.7 Đánh giá chất lượng | Chạy quality check cho measurements | Analyst, Admin |

### Module 4: 📍 Giám Sát Địa Lý (Geospatial Monitoring)

**Bảng liên quan:** `monitoring_locations`, `temporal_series`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F4.1 Quản lý vị trí giám sát | CRUD các thành phố/vùng theo dõi | Admin |
| F4.2 Bản đồ CO2 | Hiển thị XCO2 trên bản đồ (heatmap) | All |
| F4.3 Chuỗi thời gian | Biểu đồ XCO2 theo thời gian tại 1 vị trí | All |
| F4.4 Trung bình tháng/năm | Tính toán và hiển thị trends | Analyst |
| F4.5 Phát hiện hotspot | Xác định vùng CO2 cao bất thường | Analyst |
| F4.6 So sánh vùng | So sánh XCO2 giữa các vị trí | Analyst |

### Module 5: 🔄 So Sánh Dữ Liệu (Cross-Validation)

**Bảng liên quan:** `data_comparisons`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F5.1 Tìm điểm trùng lặp | Tìm cặp OCO-2/GOSAT-2 gần nhau (<50km, <1h) | System |
| F5.2 Tính chênh lệch | Tính XCO2 difference, relative % | System |
| F5.3 Báo cáo so sánh | Thống kê bias, RMSE, correlation | Analyst |
| F5.4 Biểu đồ scatter | XCO2 OCO-2 vs GOSAT-2 scatter plot | Analyst |
| F5.5 Phát hiện outliers | Cặp có chênh lệch bất thường | Analyst |

### Module 6: ⚙️ Công Việc Phân Tích (Analysis Jobs)

**Bảng liên quan:** `analysis_jobs`

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F6.1 Tạo job phân tích | Tạo job: comparison, trend, anomaly, export | Analyst |
| F6.2 Theo dõi tiến độ | Xem status, progress_percent realtime | All |
| F6.3 Xem kết quả | Download result file, xem summary | Analyst |
| F6.4 Hủy/retry job | Cancel running job hoặc retry failed | Analyst |
| F6.5 Lịch sử jobs | Danh sách jobs với filter theo status/type | All |

**Job types:**
- `comparison` — So sánh OCO-2 vs GOSAT-2
- `trend` — Phân tích xu hướng XCO2
- `anomaly` — Phát hiện bất thường
- `export` — Xuất dữ liệu lớn

### Module 7: 👥 Quản Trị Hệ Thống (Administration)

**Bảng liên quan:** GeoNode `auth_user`, `audit_log`, `system_configuration`

> **Ghi chú:** Hệ thống sử dụng user và phân quyền có sẵn của GeoNode (Django auth). Không tạo bảng user riêng.

| Chức năng | Mô tả | Actor |
|-----------|-------|-------|
| F7.1 Quản lý người dùng | Quản lý qua GeoNode admin, assign groups/permissions | Admin |
| F7.2 Xem audit log | Tra cứu lịch sử thay đổi | Admin |
| F7.3 Cấu hình hệ thống | Quản lý config key-value | Admin |
| F7.4 Dashboard thống kê | Tổng measurements, file imported, jobs | All |
| F7.5 Health check | Kiểm tra DB size, connection, performance | Admin |

---

## 4. API Endpoints

### 4.1 Satellite Management
```
GET    /api/v1/satellites/                    # Danh sách vệ tinh
GET    /api/v1/satellites/{id}/               # Chi tiết vệ tinh
GET    /api/v1/satellites/{id}/instruments/   # Instruments của vệ tinh
```

### 4.2 Data Ingestion
```
POST   /api/v1/sources/upload/               # Upload file .nc4/.h5
GET    /api/v1/sources/                       # Danh sách sources
GET    /api/v1/sources/{id}/                  # Chi tiết source + metadata
POST   /api/v1/sources/{id}/reimport/         # Re-import file
```

### 4.3 Measurements
```
GET    /api/v1/measurements/                  # List (paginated, filtered)
GET    /api/v1/measurements/{id}/             # Chi tiết
GET    /api/v1/measurements/{id}/profiles/    # Vertical profiles
GET    /api/v1/measurements/{id}/quality/     # Quality assessment
GET    /api/v1/measurements/spatial/          # Spatial query (bbox/radius)
POST   /api/v1/measurements/export/           # Export filtered data
```

### 4.4 Geospatial
```
GET    /api/v1/locations/                     # Danh sách monitoring locations
POST   /api/v1/locations/                     # Tạo location
GET    /api/v1/locations/{id}/timeseries/     # Time series data
GET    /api/v1/locations/{id}/statistics/     # Monthly/yearly stats
GET    /api/v1/map/heatmap/                   # XCO2 heatmap data
```

### 4.5 Comparison
```
POST   /api/v1/comparisons/generate/          # Tạo comparison mới
GET    /api/v1/comparisons/                    # Danh sách comparisons
GET    /api/v1/comparisons/report/             # Báo cáo thống kê
```

### 4.6 Analysis Jobs
```
POST   /api/v1/jobs/                          # Tạo job
GET    /api/v1/jobs/                           # Danh sách jobs
GET    /api/v1/jobs/{id}/                      # Chi tiết + progress
POST   /api/v1/jobs/{id}/cancel/              # Hủy job
GET    /api/v1/jobs/{id}/result/              # Download result
```

### 4.7 Administration
```
GET    /api/v1/admin/audit-log/               # Audit log
GET    /api/v1/admin/config/                   # System config
PUT    /api/v1/admin/config/{key}/             # Update config
GET    /api/v1/admin/dashboard/                # Dashboard stats
```

---

## 5. Luồng Xử Lý Chính

### 5.1 Luồng Import Dữ Liệu

```
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────────┐
│  Upload  │───→│ Validate  │───→│  Parse    │───→│   Insert     │
│  File    │    │ Hash/Type │    │ nc4/h5    │    │ measurements │
└──────────┘    └───────────┘    └───────────┘    └──────────────┘
                     │                                   │
                     │ duplicate?                        ▼
                     │ → REJECT              ┌──────────────────┐
                                             │ Insert profiles  │
                                             │ (15-20 per meas) │
                                             └──────────────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │ Quality Check    │
                                             │ → assessments    │
                                             └──────────────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │ Calculate        │
                                             │ metadata stats   │
                                             └──────────────────┘
```

### 5.2 Luồng So Sánh Cross-Validation

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│ Select date │───→│ Find OCO-2 & │───→│ Match pairs   │
│ range       │    │ GOSAT-2 data │    │ <50km, <1hour │
└─────────────┘    └──────────────┘    └───────────────┘
                                              │
                                              ▼
                                       ┌───────────────┐
                                       │ Calculate     │
                                       │ differences   │
                                       │ & statistics  │
                                       └───────────────┘
                                              │
                                              ▼
                                       ┌───────────────┐
                                       │ Store in      │
                                       │ comparisons   │
                                       │ + Report      │
                                       └───────────────┘
```

### 5.3 Luồng Phân Tích Async

```
User creates job → Status: PENDING
    → Worker picks up → Status: RUNNING (progress: 0-100%)
        → Success → Status: COMPLETED + result_path
        → Error → Status: FAILED + error_message
```

---

## 6. Phân Quyền (RBAC)

| Chức năng | Guest | Viewer | Analyst | Admin |
|-----------|-------|--------|---------|-------|
| Xem vệ tinh | ✅ | ✅ | ✅ | ✅ |
| Xem measurements | ❌ | ✅ | ✅ | ✅ |
| Tìm kiếm spatial | ❌ | ✅ | ✅ | ✅ |
| Upload file | ❌ | ❌ | ✅ | ✅ |
| Export data | ❌ | ❌ | ✅ | ✅ |
| Tạo analysis job | ❌ | ❌ | ✅ | ✅ |
| So sánh dữ liệu | ❌ | ❌ | ✅ | ✅ |
| Quản lý locations | ❌ | ❌ | ❌ | ✅ |
| Quản lý users | ❌ | ❌ | ❌ | ✅ |
| Xem audit log | ❌ | ❌ | ❌ | ✅ |
| Cấu hình hệ thống | ❌ | ❌ | ❌ | ✅ |

---

## 7. Khuyến Nghị Cải Thiện Schema

### P0 — Ưu tiên cao
1. ~~**Bảo mật**: Loại bỏ MD5~~ → ✅ Đã giải quyết (dùng GeoNode auth)
2. **Data integrity**: Tạo bảng `analysis_job_sources(job_id, source_id)` thay cho JSON
3. **Soft delete**: Thêm `deleted_at TIMESTAMP NULL` cho `measurements`

### P1 — Ưu tiên trung bình
4. **Giảm dư thừa**: Chuyển `temporal_series` thành materialized view
5. **Đơn giản hóa**: Merge `measurement_metadata` vào `measurement_sources`
6. **RBAC**: Tận dụng GeoNode Groups/Permissions cho phân quyền module CO2
7. **Tracking**: Thêm bảng `data_exports` để track file exported

### P2 — Ưu tiên thấp
8. **Mở rộng**: Thiết kế cho vệ tinh tương lai (OCO-3, GOSAT-GW)
9. **QA linh hoạt**: Bảng `data_validation_rules` cho configurable checks
10. **Performance**: Partition `vertical_profiles` theo thời gian

### Lưu ý quan trọng
- Schema dùng MySQL syntax nhưng GeoNode thường chạy **PostgreSQL/PostGIS** — cần điều chỉnh
- Ước tính thực tế nên là **~200-225 GB** (bao gồm index overhead)
- Cần cơ chế sync khi dùng denormalized tables

---

*Document Version: 1.0*
*Created: 2026-05-05*
*Based on: schema.md, Er diagram and reference.md*
