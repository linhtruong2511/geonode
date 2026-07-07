# Bản Thiết kế Cơ sở Dữ liệu (Database Design)
## Hệ thống Quản lý & Khai thác Dữ liệu Khí tượng - Thủy văn - Hải dương học

> Tài liệu này thiết kế chi tiết CSDL để đáp ứng toàn bộ các chức năng đã mô tả trong `functional_design.md` (nhóm A → F), triển khai trên **PostgreSQL + PostGIS**, tích hợp với **GeoServer** để phục vụ hiển thị/truy xuất dữ liệu lưới (NetCDF).
>
> Nguyên tắc kế thừa từ `db_architecture_plan.md`: dữ liệu vector/trạm/sự kiện lưu trực tiếp trong PostGIS; dữ liệu raster/NetCDF **không** lưu nguyên file vào CSDL mà chỉ lưu metadata + đường dẫn (để GeoServer ImageMosaic/WCS phục vụ).

---

## 1. Nguyên tắc thiết kế

1. **Chuẩn hóa hợp lý**: tách danh mục (trạm, sự kiện, bộ dữ liệu) khỏi dữ liệu đo đạc để tránh lặp lại thông tin.
2. **Phân vùng theo thời gian (Partitioning)**: các bảng dữ liệu lớn, tăng liên tục (observations, raster_granules, analysis_results, alert_notifications) được phân vùng theo năm để tối ưu tốc độ truy vấn time-series.
3. **Không lưu file gốc trong CSDL**: NetCDF, file trạm gốc, file kết quả tải về... chỉ lưu **đường dẫn** trong CSDL; nội dung nằm trên hệ thống file.
4. **Một bảng danh mục dữ liệu (catalog) chung**: mọi loại dữ liệu (lưới, trạm, sự kiện, vệ tinh) đều được đăng ký vào bảng `datasets` để phục vụ tìm kiếm (F1), quản lý metadata (E2) và phân quyền (E3) một cách thống nhất.
5. **Mọi thao tác nặng đều có "bảng trạng thái"**: các job phân tích, job tải dữ liệu AOI đều có bảng theo dõi trạng thái (pending/processing/done/failed) để phục vụ xử lý bất đồng bộ và tra cứu lịch sử.
6. **Tương thích GeoServer**: các bảng vector (`stations`, `event_tracks`, `observations` khi cần overlay) dùng kiểu `geometry` chuẩn PostGIS (SRID 4326) để GeoServer publish trực tiếp làm layer WMS/WFS.

---

## 2. Sơ đồ tổng quan các nhóm bảng

```
┌────────────────────────┐        ┌─────────────────────────┐
│   DANH MỤC DỮ LIỆU      │        │   NGƯỜI DÙNG & QUYỀN      │
│   datasets              │◄──────►│   users, roles,           │
│   dataset_variables     │        │   dataset_access_policies │
└───────────┬─────────────┘        └────────────┬─────────────┘
            │                                    │
            │ 1-n                                │ n-n
            ▼                                    ▼
┌────────────────────────┐        ┌─────────────────────────┐
│  DỮ LIỆU LÕI (CORE)     │        │  LỊCH SỬ & GIÁM SÁT       │
│  stations               │        │  user_query_history       │
│  observations            │        │  ingestion_logs           │
│  meteorological_events   │        │  system_metrics           │
│  event_tracks            │        └─────────────────────────┘
│  raster_granules_index   │
└───────────┬─────────────┘
            │
            │ tham chiếu
            ▼
┌────────────────────────┐        ┌─────────────────────────┐
│  PHÂN TÍCH & CẢNH BÁO   │        │  TẢI DỮ LIỆU THEO AOI      │
│  analysis_jobs           │        │  download_requests         │
│  analysis_results        │        │  download_request_items   │
│  extreme_events          │        │  download_files            │
│  alert_rules             │        └─────────────────────────┘
│  alert_notifications     │
└────────────────────────┘
```

---

## 3. Nhóm bảng: Danh mục Dữ liệu (Catalog) — phục vụ F1, E2, E3

### 3.1. `datasets` — Danh mục tất cả bộ dữ liệu/lớp dữ liệu trong hệ thống

Đây là bảng trung tâm: mọi loại dữ liệu (lưới WRF/ERA5/CMEMS, trạm Synop/KTTV, vệ tinh ASCAT, sự kiện bão/KKL) đều có một bản ghi mô tả tại đây, phục vụ tìm kiếm (F1) và hiển thị mô tả (E2).

```sql
CREATE TABLE datasets (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(64) UNIQUE NOT NULL,      -- mã định danh duy nhất, vd: 'wrf3km', 'era5_ocean', 'synop_189'
    name                VARCHAR(255) NOT NULL,             -- tên hiển thị
    category            VARCHAR(32) NOT NULL,              -- 'GRIDDED' | 'STATION' | 'SATELLITE' | 'EVENT'
    description         TEXT,
    source_provider      VARCHAR(255),                     -- nguồn cung cấp (VD: Copernicus, NCAR, Trung tâm KTTV)
    spatial_extent      GEOMETRY(Polygon, 4326),           -- vùng bao phủ không gian (để hiển thị & tìm kiếm)
    time_start          TIMESTAMP,                         -- thời gian bắt đầu có dữ liệu
    time_end            TIMESTAMP,                         -- thời gian gần nhất có dữ liệu (cập nhật theo ETL)
    temporal_resolution VARCHAR(32),                       -- vd: 'hourly', 'daily', '3km-hourly'
    access_level        VARCHAR(16) NOT NULL DEFAULT 'INTERNAL', -- 'PUBLIC' | 'INTERNAL' | 'RESTRICTED'
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT now(),
    updated_at          TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_datasets_category ON datasets(category);
CREATE INDEX idx_datasets_access_level ON datasets(access_level);
CREATE INDEX idx_datasets_spatial_extent ON datasets USING GIST(spatial_extent);
-- Tìm kiếm full-text theo tên/mô tả (phục vụ F1)
CREATE INDEX idx_datasets_search ON datasets USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));
```

### 3.2. `dataset_variables` — Danh sách biến trong mỗi bộ dữ liệu

```sql
CREATE TABLE dataset_variables (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    variable_code   VARCHAR(64) NOT NULL,       -- vd: 'u10m', 'v10m', 'sst', 'rain_24h'
    variable_name   VARCHAR(255) NOT NULL,      -- tên đầy đủ, vd: "Thành phần gió Đông-Tây 10m"
    unit            VARCHAR(32),                -- vd: 'm/s', 'mm', '°C', 'hPa'
    UNIQUE(dataset_id, variable_code)
);
```

---

## 4. Nhóm bảng: Dữ liệu Lõi (Core Domain Data) — phục vụ A, B, C

### 4.1. `stations` — Danh mục trạm quan trắc

```sql
CREATE TABLE stations (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER REFERENCES datasets(id),      -- trạm thuộc bộ dữ liệu nào (Synop/KTTV)
    station_code    VARCHAR(32) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    elevation       NUMERIC(8,2),
    station_type    VARCHAR(32),                          -- 'SYNOP' | 'KTTV'
    is_active       BOOLEAN DEFAULT TRUE,
    UNIQUE(dataset_id, station_code)
);

CREATE INDEX idx_stations_geom ON stations USING GIST(geom);
CREATE INDEX idx_stations_code ON stations(station_code);
```

### 4.2. `observations` — Dữ liệu đo đạc theo thời gian (phân vùng theo năm)

Phục vụ trực tiếp các chức năng **A2, A5, B1, B2, B5, C1, C2, C4**.

```sql
CREATE TABLE observations (
    id              BIGSERIAL,
    station_id      INTEGER NOT NULL REFERENCES stations(id),
    obs_time        TIMESTAMP NOT NULL,
    rain_06h        NUMERIC(6,2),
    rain_24h        NUMERIC(6,2),
    temp_2m         NUMERIC(5,2),
    temp_min        NUMERIC(5,2),
    temp_max        NUMERIC(5,2),
    humidity        NUMERIC(5,2),
    pressure        NUMERIC(6,2),
    wind_dir        NUMERIC(5,1),
    wind_speed      NUMERIC(5,2),
    PRIMARY KEY (id, obs_time)
) PARTITION BY RANGE (obs_time);

-- Ví dụ tạo partition theo năm
CREATE TABLE observations_2026 PARTITION OF observations
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX idx_obs_station_time ON observations (station_id, obs_time);
-- Tuỳ chọn nâng cao: nếu khối lượng dữ liệu trạm tăng rất nhanh,
-- có thể thay cơ chế partition thủ công này bằng TimescaleDB hypertable.
```

### 4.3. `meteorological_events` — Danh mục sự kiện bão / không khí lạnh

Phục vụ **A3, B3, C3**.

```sql
CREATE TABLE meteorological_events (
    id              SERIAL PRIMARY KEY,
    event_name      VARCHAR(255) NOT NULL,      -- vd: 'Typhoon Yagi'
    event_type      VARCHAR(32) NOT NULL,       -- 'TYPHOON' | 'COLD_SURGE'
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    influence_area  GEOMETRY(Polygon, 4326),    -- vùng ảnh hưởng tổng thể (tính từ track, phục vụ B3 nhanh hơn)
    max_intensity   VARCHAR(64),                -- cấp bão cao nhất đạt được, tóm tắt cho hiển thị nhanh
    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_events_type ON meteorological_events(event_type);
CREATE INDEX idx_events_influence_area ON meteorological_events USING GIST(influence_area);
```

### 4.4. `event_tracks` — Đường đi / vị trí theo thời gian của sự kiện

```sql
CREATE TABLE event_tracks (
    id                  SERIAL PRIMARY KEY,
    event_id            INTEGER NOT NULL REFERENCES meteorological_events(id) ON DELETE CASCADE,
    track_time          TIMESTAMP NOT NULL,
    geom                GEOMETRY(Point, 4326) NOT NULL,   -- tâm bão / vị trí ranh giới KKL
    intensity           VARCHAR(64),                       -- cấp gió / sức gió max
    central_pressure    NUMERIC(6,2),
    moving_speed_kmh    NUMERIC(6,2),                       -- tốc độ di chuyển (hỗ trợ C3)
    moving_direction    NUMERIC(5,1)                        -- hướng di chuyển độ (hỗ trợ C3)
);

CREATE INDEX idx_tracks_event_time ON event_tracks(event_id, track_time);
CREATE INDEX idx_tracks_geom ON event_tracks USING GIST(geom);
```

### 4.5. `raster_granules_index` — Chỉ mục dữ liệu lưới/NetCDF (WRF, ERA5, CMEMS, ASCAT)

Phục vụ **A1, A4, A6, B4, D2/D3** — GeoServer ImageMosaic có thể tự sinh bảng tương tự, hoặc dùng bảng này làm chuẩn.

```sql
CREATE TABLE raster_granules_index (
    id              BIGSERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id),
    file_location   TEXT NOT NULL,               -- đường dẫn tương đối tới file .nc gốc
    granule_time    TIMESTAMP NOT NULL,          -- thời gian của lớp dữ liệu trong file
    elevation       NUMERIC(8,2),                -- độ sâu/độ cao nếu có (dữ liệu đại dương)
    footprint       GEOMETRY(Polygon, 4326) NOT NULL,  -- vùng bao phủ không gian của granule
    variable_code   VARCHAR(64)                  -- biến chính chứa trong granule (nếu file tách theo biến)
);

CREATE INDEX idx_raster_dataset_time ON raster_granules_index(dataset_id, granule_time);
CREATE INDEX idx_raster_footprint ON raster_granules_index USING GIST(footprint);
```

---

## 5. Nhóm bảng: Người dùng & Phân quyền — phục vụ E3, F2

### 5.1. `users`

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(255),
    password_hash   TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT now()
);
```

### 5.2. `roles` và `user_roles`

```sql
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    role_code   VARCHAR(32) UNIQUE NOT NULL   -- 'PUBLIC' | 'FORECASTER' | 'RESEARCHER' | 'ADMIN'
);

CREATE TABLE user_roles (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
```

### 5.3. `dataset_access_policies` — Phân quyền truy cập theo bộ dữ liệu

Cho phép một bộ dữ liệu công khai một phần, hạn chế một phần theo nhóm quyền — hỗ trợ trực tiếp quyết định nghiệp vụ "có thể public ra ngoài".

```sql
CREATE TABLE dataset_access_policies (
    id          SERIAL PRIMARY KEY,
    dataset_id  INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    can_view    BOOLEAN DEFAULT TRUE,
    can_query   BOOLEAN DEFAULT TRUE,
    can_download BOOLEAN DEFAULT FALSE,
    UNIQUE(dataset_id, role_id)
);
```

---

## 6. Nhóm bảng: Phân tích & Cảnh báo — phục vụ nhóm C

### 6.1. `analysis_jobs` — Theo dõi các tác vụ phân tích (chạy nền)

```sql
CREATE TABLE analysis_jobs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    analysis_type   VARCHAR(32) NOT NULL,  -- 'STATISTICS' | 'EXTREME_DETECTION' | 'TYPHOON_ANALYSIS' | 'MODEL_VERIFICATION' | 'INTERPOLATION'
    parameters      JSONB NOT NULL,        -- tham số đầu vào: dataset, biến, vùng, khoảng thời gian, ngưỡng...
    status          VARCHAR(16) DEFAULT 'PENDING',  -- PENDING | PROCESSING | DONE | FAILED
    result_summary  JSONB,                 -- tóm tắt kết quả (để hiển thị nhanh, không cần join analysis_results)
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT now(),
    finished_at     TIMESTAMP
);

CREATE INDEX idx_analysis_jobs_user ON analysis_jobs(user_id, created_at DESC);
CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status);
```

### 6.2. `analysis_results` — Kết quả chi tiết (VD: chuỗi thống kê, kết quả nội suy dạng điểm)

```sql
CREATE TABLE analysis_results (
    id              BIGSERIAL,
    job_id          INTEGER NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    result_time     TIMESTAMP,             -- mốc thời gian của kết quả (thống kê theo ngày/tháng...)
    geom            GEOMETRY(Geometry, 4326), -- điểm/vùng liên quan (cho kết quả nội suy hoặc theo trạm)
    metric_name     VARCHAR(64),           -- vd: 'avg_temp', 'rmse', 'bias'
    metric_value    NUMERIC,
    PRIMARY KEY (id, job_id)
);

CREATE INDEX idx_results_job ON analysis_results(job_id, result_time);
CREATE INDEX idx_results_geom ON analysis_results USING GIST(geom);
```

### 6.3. `extreme_events` — Các đợt cực trị được phát hiện (C2)

```sql
CREATE TABLE extreme_events (
    id              SERIAL PRIMARY KEY,
    job_id          INTEGER REFERENCES analysis_jobs(id),
    station_id      INTEGER REFERENCES stations(id),
    extreme_type    VARCHAR(32) NOT NULL,   -- 'HEATWAVE' | 'COLD_SPELL' | 'HEAVY_RAIN'
    start_time      TIMESTAMP NOT NULL,
    end_time        TIMESTAMP,
    peak_value      NUMERIC,
    threshold_used  NUMERIC
);

CREATE INDEX idx_extreme_station_time ON extreme_events(station_id, start_time);
```

### 6.4. `alert_rules` và `alert_notifications` — Cảnh báo ngưỡng (C6)

```sql
CREATE TABLE alert_rules (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    dataset_id      INTEGER REFERENCES datasets(id),
    variable_code   VARCHAR(64),
    area            GEOMETRY(Polygon, 4326),   -- vùng quan tâm để áp dụng cảnh báo (NULL = toàn bộ dataset)
    threshold_operator VARCHAR(4) NOT NULL,     -- '>' | '<' | '>=' | '<='
    threshold_value NUMERIC NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT now()
);

CREATE TABLE alert_notifications (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_at    TIMESTAMP NOT NULL,
    triggered_value NUMERIC,
    location        GEOMETRY(Point, 4326),
    is_read         BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);
CREATE INDEX idx_alert_notifications_rule ON alert_notifications(rule_id, triggered_at DESC);
```

---

## 7. Nhóm bảng: Tải dữ liệu theo Vùng quan tâm (AOI) — phục vụ nhóm D

### 7.1. `download_requests` — Yêu cầu tải dữ liệu

```sql
CREATE TABLE download_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    aoi_geom        GEOMETRY(Geometry, 4326),   -- vùng vẽ tự do / bbox
    station_ids     INTEGER[],                  -- nếu chọn theo danh sách trạm thay vì vùng
    time_start      TIMESTAMP NOT NULL,
    time_end        TIMESTAMP NOT NULL,
    status          VARCHAR(16) DEFAULT 'PENDING', -- PENDING | PROCESSING | READY | FAILED | EXPIRED
    estimated_size_mb NUMERIC,
    requested_at    TIMESTAMP DEFAULT now(),
    completed_at    TIMESTAMP,
    expires_at      TIMESTAMP                   -- thời hạn lưu file kết quả trước khi tự xoá
);

CREATE INDEX idx_download_requests_user ON download_requests(user_id, requested_at DESC);
CREATE INDEX idx_download_requests_status ON download_requests(status);
```

### 7.2. `download_request_items` — Chi tiết từng bộ dữ liệu trong 1 yêu cầu

Một yêu cầu tải có thể gồm nhiều loại dữ liệu (VD: vừa trạm vừa lưới).

```sql
CREATE TABLE download_request_items (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL REFERENCES download_requests(id) ON DELETE CASCADE,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id),
    variable_codes  VARCHAR(64)[],               -- các biến được chọn tải
    export_format   VARCHAR(16)                  -- 'CSV' | 'NETCDF' | 'GEOTIFF' | 'GEOJSON' | 'SHAPEFILE'
);
```

### 7.3. `download_files` — File kết quả đã đóng gói

```sql
CREATE TABLE download_files (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL REFERENCES download_requests(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,               -- đường dẫn file kết quả trên hệ thống lưu trữ
    file_size_mb    NUMERIC,
    created_at      TIMESTAMP DEFAULT now()
);
```

---

## 8. Nhóm bảng: Lịch sử & Giám sát — phục vụ F3, E4

### 8.1. `user_query_history`

```sql
CREATE TABLE user_query_history (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    query_type      VARCHAR(32) NOT NULL,   -- 'STATION_QUERY' | 'SPATIAL_QUERY' | 'EVENT_QUERY' | 'GRID_QUERY' | 'COMPARISON_QUERY'
    parameters      JSONB NOT NULL,
    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_query_history_user ON user_query_history(user_id, created_at DESC);
```

### 8.2. `ingestion_logs` — Nhật ký nạp dữ liệu (E1)

```sql
CREATE TABLE ingestion_logs (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER REFERENCES datasets(id),
    source_file     TEXT,
    status          VARCHAR(16) NOT NULL,   -- 'SUCCESS' | 'FAILED' | 'PARTIAL'
    records_processed INTEGER,
    error_message   TEXT,
    started_at      TIMESTAMP DEFAULT now(),
    finished_at     TIMESTAMP
);
```

### 8.3. `system_metrics` — Chỉ số giám sát vận hành (E4)

```sql
CREATE TABLE system_metrics (
    id              SERIAL PRIMARY KEY,
    metric_name     VARCHAR(64) NOT NULL,   -- vd: 'storage_used_gb', 'active_download_jobs', 'failed_jobs_today'
    metric_value    NUMERIC NOT NULL,
    recorded_at     TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, recorded_at DESC);
```

---

## 9. Ma trận truy vết: Chức năng (functional_design.md) ↔ Bảng dữ liệu

| Chức năng | Bảng liên quan chính |
|---|---|
| A1 — Bản đồ dữ liệu lưới | `datasets`, `raster_granules_index` |
| A2 — Lớp trạm quan trắc | `stations`, `observations` |
| A3 — Đường đi bão/KKL | `meteorological_events`, `event_tracks` |
| A4 — So sánh lớp | `datasets`, `raster_granules_index` |
| A5 — Biểu đồ chuỗi thời gian | `observations` |
| A6 — Time slider | `raster_granules_index.granule_time`, `observations.obs_time` |
| B1 — Truy vấn trạm+thời gian | `stations`, `observations` |
| B2 — Truy vấn không gian | `stations`, `observations` (dùng `ST_DWithin`/`ST_Intersects` trên `geom`) |
| B3 — Truy vấn theo sự kiện | `meteorological_events`, `event_tracks`, `stations`, `observations` |
| B4 — Giá trị lưới tại điểm | `raster_granules_index` |
| B5 — Truy vấn kết hợp đa nguồn | `observations` + `raster_granules_index` |
| C1 — Thống kê tổng hợp | `analysis_jobs`, `analysis_results` |
| C2 — Phát hiện cực trị | `extreme_events` |
| C3 — Phân tích quỹ đạo bão | `event_tracks` (các cột `moving_speed_kmh`, `moving_direction`) |
| C4 — Đánh giá sai số mô hình | `analysis_jobs`, `analysis_results` |
| C5 — Nội suy không gian | `analysis_jobs`, `analysis_results` (geom dạng lưới điểm) |
| C6 — Cảnh báo ngưỡng | `alert_rules`, `alert_notifications` |
| D1-D2 — Chọn AOI & tham số tải | `download_requests`, `download_request_items` |
| D3 — Xử lý đóng gói | `download_requests.status`, `download_files` |
| D4 — Nhận kết quả | `download_files` |
| E1 — Nạp dữ liệu | `ingestion_logs` |
| E2 — Quản lý metadata | `datasets`, `dataset_variables` |
| E3 — Phân quyền | `roles`, `user_roles`, `dataset_access_policies` |
| E4 — Giám sát hệ thống | `system_metrics`, `ingestion_logs`, `download_requests` |
| F1 — Tìm kiếm dataset | `datasets` (full-text + spatial index) |
| F2 — Tài khoản người dùng | `users`, `roles`, `user_roles` |
| F3 — Lịch sử thao tác | `user_query_history`, `download_requests` |

---

## 10. Ghi chú tối ưu hóa & tích hợp GeoServer

- **Partitioning theo năm** áp dụng cho: `observations`, `raster_granules_index` (có thể để nguyên không partition nếu số lượng granule không quá lớn, đánh giá lại khi triển khai), `analysis_results`, `alert_notifications` (nếu tần suất cao).
- **Chỉ số không gian (GIST)** bắt buộc trên mọi cột `geometry` được dùng để lọc theo vùng: `stations.geom`, `event_tracks.geom`, `datasets.spatial_extent`, `raster_granules_index.footprint`.
- **GeoServer publish trực tiếp** các bảng: `stations`, `event_tracks`, `meteorological_events.influence_area` làm layer WFS/WMS; `raster_granules_index` làm nguồn cho ImageMosaic (GeoServer có thể tự sinh cấu trúc tương đương bảng này — cần thống nhất một trong hai cách khi triển khai để tránh trùng lặp).
- **Không đưa dữ liệu NetCDF/raster gốc vào PostgreSQL** — giữ nguyên nguyên tắc từ `db_architecture_plan.md`.
- **Nâng cấp lên TimescaleDB**: nếu về sau khối lượng `observations` hoặc `analysis_results` tăng nhanh, các bảng này có thể chuyển đổi sang mô hình hypertable mà không ảnh hưởng đến các bảng khác trong thiết kế.

---

## 11. Câu hỏi cần xác nhận thêm trước khi triển khai DDL chính thức

1. Cơ chế phân quyền có cần chi tiết đến từng **biến** trong một bộ dữ liệu (VD: công khai nhiệt độ nhưng hạn chế gió) hay chỉ cần ở mức **bộ dữ liệu** như thiết kế hiện tại?
2. `download_files` có cần chính sách tự động xoá theo `expires_at` (dọn dẹp định kỳ) hay giữ vĩnh viễn cho tới khi người dùng tự xoá?
3. Ngưỡng cảnh báo (`alert_rules`) có cần hỗ trợ điều kiện kết hợp nhiều biến cùng lúc (VD: gió > X **và** áp suất < Y) hay mỗi rule chỉ áp dụng cho một biến như hiện tại?
