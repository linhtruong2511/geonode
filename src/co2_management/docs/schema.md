# 🛰️ Thiết Kế Cơ Sở Dữ Liệu: CO2 Management System

## 📋 Mục Lục
1. [Tổng Quan](#tổng-quan)
2. [Kiến Trúc Database](#kiến-trúc-database)
3. [Mô Tả Chi Tiết Các Bảng](#mô-tả-chi-tiết-các-bảng)
4. [Mối Quan Hệ Giữa Các Bảng](#mối-quan-hệ-giữa-các-bảng)
5. [Chiến Lược Lưu Trữ](#chiến-lược-lưu-trữ)
6. [Tối Ưu Hiệu Suất](#tối-ưu-hiệu-suất)
7. [Bảo Mật và Kiểm Soát Truy Cập](#bảo-mật-và-kiểm-soát-truy-cập)

---

## 🎯 Tổng Quan

### Mục Đích
Cơ sở dữ liệu được thiết kế để **quản lý, lưu trữ, phân tích và so sánh dữ liệu CO2** từ hai vệ tinh:
- **OCO-2**: Orbital Carbon Observatory-2 (NASA)
- **GOSAT-2**: Greenhouse gases Observing Satellite-2 (JAXA)

### Đặc Điểm Chính
- ✅ Hỗ trợ cả hai định dạng: **netCDF4** (OCO-2) và **HDF5** (GOSAT-2)
- ✅ Lưu trữ hơn **61 triệu điểm đo lường**
- ✅ Thông tin địa lý với **spatial indexing**
- ✅ Hồ sơ theo chiều cao (15-20 levels)
- ✅ Quản lý chất lượng dữ liệu tích hợp
- ✅ Chuỗi thời gian và phân tích xu hướng
- ✅ Audit log đầy đủ
- ✅ Hỗ trợ công việc phân tích không đồng bộ

## 🏗️ Kiến Trúc Database

### Phân Nhóm Bảng Theo Chức Năng

```
┌─────────────────────────────────────────────────────────┐
│           CO2 MANAGEMENT DATABASE SCHEMA                 │
└─────────────────────────────────────────────────────────┘

├─ 🛰️ INFRASTRUCTURE (Vệ tinh)
│  ├─ satellites (thông tin vệ tinh)
│  └─ satellite_instruments (dụng cụ trên vệ tinh)
│
├─ 📊 DATA INGESTION (Nhập dữ liệu)
│  ├─ measurement_sources (file dữ liệu)
│  └─ measurement_metadata (metadata đợt đo lường)
│
├─ 🔬 MEASUREMENTS (Dữ liệu chính)
│  ├─ measurements (đo lường XCO2 chính)
│  ├─ vertical_profiles (hồ sơ theo chiều cao)
│  └─ quality_assessments (đánh giá chất lượng)
│
├─ 📍 GEOSPATIAL (Thông tin địa lý)
│  ├─ monitoring_locations (vị trí giám sát)
│  └─ temporal_series (chuỗi thời gian)
│
├─ 🔄 COMPARISON (So sánh dữ liệu)
│  └─ data_comparisons (kết quả so sánh OCO2 vs GOSAT2)
│
├─ ⚙️ ANALYSIS (Công việc phân tích)
│  └─ analysis_jobs (công việc phân tích)
│
└─ 👥 ADMINISTRATION (Quản trị)
   ├─ users (người dùng)
   ├─ audit_log (nhật ký hoạt động)
   └─ system_configuration (cấu hình hệ thống)
```

---

## 📝 Mô Tả Chi Tiết Các Bảng

### 1️⃣ BẢNG SATELLITES (Vệ Tinh)

**Mục Đích**: Lưu trữ thông tin về các vệ tinh đang hoạt động

| Cột | Kiểu Dữ Liệu | Mô Tả |
|-----|-------------|-------|
| `satellite_id` | INT PK | ID duy nhất |
| `satellite_name` | VARCHAR(50) | OCO-2, GOSAT-2 |
| `launch_date` | DATE | Ngày phóng |
| `operator` | VARCHAR(100) | NASA, JAXA |
| `orbital_altitude_km` | DECIMAL | Độ cao quỹ đạo |
| `orbital_period_minutes` | DECIMAL | Chu kỳ quỹ đạo |
| `orbital_inclination_deg` | DECIMAL | Góc nghiêng quỹ đạo |
| `is_active` | BOOLEAN | Vệ tinh còn hoạt động |


### 2️⃣ BẢNG SATELLITE_INSTRUMENTS (Dụng Cụ)

**Mục Đích**: Mô tả các dụng cụ phổ kế trên vệ tinh

| Cột Quan Trọng | Mô Tả |
|---|---|
| `satellite_id` | FK → satellites |
| `instrument_name` | FTS (OCO-2), TTS (GOSAT-2) |
| `spectral_bands` | Số dải phổ (3, 5, 6) |
| `spectral_range_min/max_nm` | Phạm vi bước sóng |
| `spatial_resolution_km` | Độ phân giải không gian |

### 3️⃣ BẢNG MEASUREMENT_SOURCES (Nguồn Dữ Liệu)

**Mục Đích**: Quản lý các file dữ liệu gốc (OCO-2 .nc4 hoặc GOSAT-2 .h5)

| Cột Quan Trọng | Mô Tả |
|---|---|
| `satellite_id` | FK → satellites |
| `file_name` | Tên file gốc |
| `file_format` | 'netCDF4' hoặc 'HDF5' |
| `file_size_mb` | Kích thước file |
| `measurement_date` | Ngày dữ liệu được thu thập |
| `total_soundings` | Số lượng measurements |
| `quality_checked` | Đã kiểm tra chất lượng? |
| `processing_level` | L1, L2, L3 |
| `algorithm_version` | Phiên bản thuật toán |

**Mối Quan Hệ**: 
```
1 measurement_source → nhiều measurements
1 measurement_source → 1 measurement_metadata
```

### 4️⃣ BẢNG MEASUREMENTS (Dữ Liệu Chính)

**Mục Đích**: Lưu trữ dữ liệu XCO2 chính từ mỗi sounding

| Cột | Mô Tả |
|-----|-------|
| `measurement_id` | BIGINT PK (Auto-increment) |
| `source_id` | FK → measurement_sources |
| `latitude, longitude` | Tọa độ địa lý |
| `geom` | POINT spatial (SRID 4326) |
| **`xco2_ppm`** | ⭐ XCO2 - biến chính |
| `xco2_uncertainty_ppm` | Độ không chắc chắn |
| `xco2_quality_flag` | Cờ chất lượng (0=tốt) |
| `surface_pressure_hpa` | Áp suất bề mặt |
| `solar_zenith_angle_deg` | Góc thiên đỉnh mặt trời |
| `view_zenith_angle_deg` | Góc thiên đỉnh chế độ xem |
| `cloud_flag` | Cờ mây |
| `land_fraction` | Tỷ lệ đất liền |
| `data_source` | 'OCO2' hoặc 'GOSAT2' |

**Chỉ Mục**:
- `PRIMARY KEY`: measurement_id
- `SPATIAL INDEX`: geom (cho truy vấn vị trí)
- `INDEX`: source_id, measurement_time, xco2_ppm
- `INDEX`: data_source, xco2_quality_flag

**Ví Dụ Dữ Liệu**:
```
measurement_id | latitude | longitude | xco2_ppm | data_source
123456         | 21.5     | 105.8     | 410.25   | OCO2
123457         | 21.6     | 105.7     | 410.18   | GOSAT2
```

### 5️⃣ BẢNG VERTICAL_PROFILES (Hồ Sơ Theo Chiều Cao)

**Mục Đích**: Lưu trữ hồ sơ CO2 ở mỗi mức áp suất

| Cột | Mô Tả |
|-----|-------|
| `profile_id` | BIGINT PK |
| `measurement_id` | FK → measurements |
| `level_index` | 1-20 (OCO-2) hoặc 1-15 (GOSAT-2) |
| `pressure_hpa` | Áp suất (hPa) |
| `co2_concentration_ppm` | Nồng độ CO2 ở mức này |
| `co2_uncertainty_ppm` | Độ không chắc chắn |
| `temperature_k` | Nhiệt độ (Kelvin) |
| `averaging_kernel` | Nhân trung bình |

**Tối Ưu**: Bảng này chứa ~15-20 bản ghi cho mỗi measurement

### 6️⃣ BẢNG QUALITY_ASSESSMENTS (Đánh Giá Chất Lượng)

**Mục Đích**: Ghi lại kết quả kiểm tra chất lượng

| Cột | Mô Tả |
|-----|-------|
| `assessment_id` | INT PK |
| `measurement_id` | FK → measurements |
| `quality_score` | 0-100 |
| `is_valid` | Dữ liệu hợp lệ? |
| `validation_flags` | JSON chứa các cờ kiểm tra |
| `error_messages` | Chi tiết lỗi nếu có |

**Ví Dụ JSON**:
```json
{
  "cloud_check": true,
  "snr_check": true,
  "pressure_check": false,
  "error": "Invalid pressure profile"
}
```

### 7️⃣ BẢNG MONITORING_LOCATIONS (Vị Trí Giám Sát)

**Mục Đích**: Định nghĩa các khu vực/thành phố để theo dõi CO2

| Cột | Mô Tả |
|-----|-------|
| `location_id` | INT PK |
| `location_name` | Hà Nội, TP.HCM, vùng công nghiệp |
| `location_type` | city, region, industrial, research |
| `latitude, longitude` | Tọa độ trung tâm |
| `geom` | POINT spatial |
| `radius_km` | Bán kính giám sát |

**Ứng Dụng**: 
- Phân tích CO2 ở các thành phố
- Theo dõi xu hướng vùng công nghiệp
- Xác định hotspot phát thải

### 8️⃣ BẢNG TEMPORAL_SERIES (Chuỗi Thời Gian)

**Mục Đích**: Lưu chuỗi thời gian XCO2 từ các vị trí giám sát

| Cột | Mô Tả |
|-----|-------|
| `series_id` | BIGINT PK |
| `location_id` | FK → monitoring_locations |
| `measurement_id` | FK → measurements |
| `measurement_date` | DATE |
| `xco2_ppm` | Giá trị XCO2 |
| `data_source` | 'OCO2' hoặc 'GOSAT2' |

**Lợi Ích**:
- Dễ dàng truy vấn chuỗi thời gian
- Tính toán trung bình tháng/năm
- Phân tích xu hướng

### 9️⃣ BẢNG DATA_COMPARISONS (So Sánh Dữ Liệu)

**Mục Đích**: Lưu trữ kết quả so sánh giữa OCO-2 và GOSAT-2

| Cột | Mô Tả |
|-----|-------|
| `comparison_id` | INT PK |
| `oco2_measurement_id` | FK → measurements |
| `gosat2_measurement_id` | FK → measurements |
| `spatial_distance_km` | Khoảng cách không gian |
| `xco2_difference_ppm` | Chênh lệch XCO2 |
| `comparison_type` | 'spatial', 'temporal', 'random' |

**Ứng Dụng**:
- Xác thực chéo dữ liệu
- Phát hiện lỗi hệ thống
- So sánh độ chính xác

### 🔟 BẢNG ANALYSIS_JOBS (Công Việc Phân Tích)

**Mục Đích**: Quản lý các công việc phân tích không đồng bộ

| Cột | Mô Tả |
|-----|-------|
| `job_id` | INT PK |
| `user_id` | FK → users |
| `job_name` | Tên công việc |
| `job_type` | comparison, trend, anomaly, export |
| `source_ids` | JSON: [1, 2, 3] |
| `parameters` | JSON: {"threshold": 0.5} |
| `status` | pending, running, completed, failed |
| `progress_percent` | 0-100 |
| `result_path` | /results/job_123.csv |

**Ví Dụ**:
```json
{
  "job_id": 1,
  "job_name": "Compare OCO-2 vs GOSAT-2 Feb 2023",
  "job_type": "comparison",
  "source_ids": [1, 2],
  "status": "completed",
  "progress_percent": 100,
  "result_path": "/results/comparison_20240101.csv"
}
```

### 1️⃣2️⃣ BẢNG AUDIT_LOG (Nhật Ký Kiểm Toán)

**Mục Đích**: Ghi lại tất cả hành động chỉnh sửa

| Cột | Mô Tả |
|-----|-------|
| `log_id` | BIGINT PK |
| `user_id` | FK → users |
| `action` | INSERT, UPDATE, DELETE, QUERY |
| `table_name` | Bảng bị ảnh hưởng |
| `old_value` | JSON giá trị cũ |
| `new_value` | JSON giá trị mới |

**Bảo Mật**: Không thể xóa audit log cũ

---

## 🔗 Mối Quan Hệ Giữa Các Bảng

```
satellites (1) ──┬──→ (N) satellite_instruments
                 └──→ (N) measurement_sources
                      │
                      └──→ (1) measurement_metadata
                      └──→ (N) measurements
                           │
                           ├──→ (N) vertical_profiles
                           ├──→ (1) quality_assessments
                           └──→ (N) temporal_series ←── (1) monitoring_locations
                           
measurements (M) ←──→ (N) measurements
                        └→ data_comparisons

users (1) ──→ (N) analysis_jobs
          └──→ (N) audit_log
```

---

## 💾 Chiến Lược Lưu Trữ

### Ước Tính Kích Thước

| Thành Phần | Số Lượng | Kích Thước/Bản Ghi | Tổng Cộng |
|-----------|---------|-------------------|----------|
| measurements (OCO-2 + GOSAT-2) | 61M+ | 500 bytes | ~30 GB |
| vertical_profiles | 900M+ | 100 bytes | ~90 GB |
| data_comparisons | ~10M | 200 bytes | ~2 GB |
| **TOTAL** | | | **~150 GB** |

### Chiến Lược Phân Vùng (Partitioning)

```sql
-- Partition measurements bảng theo tháng
ALTER TABLE measurements PARTITION BY RANGE (YEAR_MONTH(measurement_time)) (
    PARTITION p_202301 VALUES LESS THAN ('202302'),
    PARTITION p_202302 VALUES LESS THAN ('202303'),
    ...
);
```

### Compression

```sql
-- Bật compression cho vertical_profiles
ALTER TABLE vertical_profiles COMPRESSION='zstd';
```

### Archiving

```sql
-- Archive dữ liệu cũ hơn 2 năm
PARTITION p_old VALUES LESS THAN ('202101')
    -- Move to separate InnoDB file per partition
```

---

## ⚡ Tối Ưu Hiệu Suất

### Chiến Lược Indexing

```sql
-- 1. Spatial Index cho truy vấn vị trí
ALTER TABLE measurements ADD SPATIAL INDEX idx_geom (geom);

-- 2. Composite Index cho truy vấn thường gặp
ALTER TABLE measurements ADD INDEX idx_source_date 
    (source_id, measurement_time);

-- 3. Full-Text Index cho tìm kiếm
ALTER TABLE monitoring_locations ADD FULLTEXT INDEX idx_location_search 
    (location_name, description);

-- 4. Covering Index
ALTER TABLE measurements ADD INDEX idx_data_quality 
    (data_source, xco2_quality_flag, xco2_ppm);
```

### Query Optimization

**Truy vấn 1**: Tìm tất cả measurements gần một điểm
```sql
-- ❌ SLOW
SELECT * FROM measurements 
WHERE latitude BETWEEN ? AND ? 
  AND longitude BETWEEN ? AND ?;

-- ✅ FAST
SELECT * FROM measurements 
WHERE ST_Contains(
    ST_Buffer(ST_PointFromText('POINT(21.5 105.8)', 4326), 0.1),
    geom
);
```

**Truy vấn 2**: So sánh OCO-2 vs GOSAT-2
```sql
-- ✅ OPTIMIZED
SELECT 
    COUNT(*) as count,
    AVG(xco2_ppm) as avg_xco2,
    STDDEV(xco2_ppm) as std_xco2
FROM measurements
WHERE data_source = ? 
  AND xco2_quality_flag = 0  -- Use index
  AND measurement_time BETWEEN ? AND ?;
```

### Cache Strategy

```
Application Layer:
  ├─ Redis Cache (XCO2 statistics)
  ├─ Memcached (user sessions)
  └─ Query Cache (disabled in MySQL 8.0+)

Database Level:
  ├─ Buffer Pool (25-50% RAM)
  └─ Query Cache (deprecated, use app layer)
```

---

## 🔒 Bảo Mật và Kiểm Soát Truy Cập

### Role-Based Access Control (RBAC)

| Role | Quyền | Bảng |
|------|-------|------|
| **Admin** | SELECT, INSERT, UPDATE, DELETE | Tất cả |
| **Analyst** | SELECT, INSERT, UPDATE | measurements, analysis_jobs |
| **Viewer** | SELECT | measurements, monitoring_locations |
| **Guest** | SELECT | public views only |

### SQL Script

```sql
-- Admin role
GRANT ALL PRIVILEGES ON co2_management_db.* 
TO 'admin'@'%' WITH GRANT OPTION;

-- Analyst role
GRANT SELECT, INSERT, UPDATE ON co2_management_db.measurements 
TO 'analyst'@'%';
GRANT EXECUTE ON co2_management_db.sp_* 
TO 'analyst'@'%';

-- Viewer role
GRANT SELECT ON co2_management_db.v_* 
TO 'viewer'@'%';
```

### Data Privacy

```sql
-- Mã hóa mật khẩu người dùng
UPDATE users SET password_hash = MD5(CONCAT(password, salt));

-- Audit log không thể xóa
ALTER TABLE audit_log CHANGE COLUMN created_at created_at 
    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
```

### Connection Security

```
SSL/TLS:
  - Tất cả kết nối phải dùng SSL
  - Certificate pinning cho sensitive operations

Firewall:
  - Chỉ cho phép IP được phép
  - Connection timeout: 10 phút
  
Backup:
  - Hàng ngày, mã hóa, lưu offline
```

---

## 📈 Monitoring và Maintenance

### Performance Monitoring

```sql
-- Kiểm tra chỉ mục không được dùng
SELECT * FROM sys.schema_unused_indexes;

-- Kiểm tra truy vấn chậm
SELECT * FROM performance_schema.events_statements_summary_by_digest 
ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;
```

### Regular Maintenance

```sql
-- Optimize tables hàng tuần
OPTIMIZE TABLE measurements;
OPTIMIZE TABLE vertical_profiles;

-- Check table integrity
CHECK TABLE measurements, vertical_profiles;

-- Rebuild indexes
REBUILD INDEX idx_geom ON measurements;
```

---

## 📚 Các Views Hữu Ích

```sql
-- View: Thống kê dữ liệu theo vệ tinh
SELECT * FROM v_satellite_statistics;

-- View: Chất lượng dữ liệu
SELECT * FROM v_data_quality_summary;

-- View: So sánh OCO-2 vs GOSAT-2
SELECT * FROM v_oco2_vs_gosat2_comparison;
```

---

## 🔄 Ví Dụ Quy Trình Nhập Dữ Liệu

```
1. Upload OCO-2 (.nc4) hoặc GOSAT-2 (.h5)
   ↓
2. Validate file format & hash
   ↓
3. Parse data → INSERT into measurement_sources
   ↓
4. Extract measurements → INSERT into measurements
   ↓
5. Extract profiles → INSERT into vertical_profiles
   ↓
6. Calculate metadata → INSERT into measurement_metadata
   ↓
7. Quality check → INSERT into quality_assessments
   ↓
8. Mark quality_checked = TRUE
   ↓
9. Data ready for analysis
```

---

## 📞 Hỗ Trợ và Liên Hệ

- **Documentation**: `/docs/database/`
- **Issues**: GitHub Issues
- **Discussion**: Team Slack #db-design