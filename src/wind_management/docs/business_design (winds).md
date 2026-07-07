# Bản Thiết kế Nghiệp vụ (Business Design)
## Hệ thống Quản lý & Khai thác Dữ liệu Khí tượng - Thủy văn - Hải dương học tích hợp GeoNode

---

## 1. Bối cảnh và Mục tiêu

Dựa trên `data_summary.md` và `db_architecture_plan.md`, tổ chức hiện có kho dữ liệu (~20-30GB) gồm 4 nhóm: dữ liệu lưới/mô hình (WRF, ERA5, CMEMS), dữ liệu trạm quan trắc (SYNOP, KTTV), dữ liệu vệ tinh (ASCAT) và dữ liệu chuyên đề (bão, không khí lạnh).

**Mục tiêu nghiệp vụ**: xây dựng một hệ thống tích hợp trên nền GeoNode, cho phép người dùng (nhà nghiên cứu, dự báo viên, quản lý) **xem, truy vấn, phân tích và tải dữ liệu** một cách thống nhất, không cần biết dữ liệu gốc đang nằm ở NetCDF, PostgreSQL hay file trạm.

**4 nhóm chức năng chính cần xây dựng:**
1. Trực quan hóa dữ liệu (Visualization)
2. Hỗ trợ truy vấn (Query)
3. Phân tích dữ liệu (Analysis)
4. Tải dữ liệu theo vùng quan tâm (AOI Download)

---

## 2. Đối tượng người dùng (User Personas)

| Vai trò | Nhu cầu chính | Mức quyền |
|---|---|---|
| **Dự báo viên** | Xem nhanh layer gió/mưa/bão theo thời gian thực, so sánh mô hình vs quan trắc | Xem + truy vấn |
| **Nhà nghiên cứu** | Truy vấn chuỗi thời gian dài, tải dữ liệu vùng quan tâm để chạy mô hình riêng | Xem + truy vấn + tải |
| **Quản trị dữ liệu (Admin)** | Nạp dữ liệu mới (ETL), quản lý metadata, cấu hình layer GeoServer | Toàn quyền |
| **Khách/đối tác bên ngoài** | Xem bản đồ công khai, tải dữ liệu đã được duyệt | Chỉ xem (giới hạn) |

---

## 3. Kiến trúc chức năng tổng quan

```
                    ┌─────────────────────────────┐
                    │        GeoNode Portal        │
                    │  (Giao diện web thống nhất)   │
                    └──────────────┬───────────────┘
                                   │
        ┌───────────────┬─────────┼─────────┬────────────────┐
        │                │                   │                │
   ┌────▼────┐     ┌─────▼─────┐      ┌──────▼──────┐   ┌─────▼─────┐
   │ Module   │     │  Module    │      │  Module      │   │ Module     │
   │ Trực quan│     │  Truy vấn  │      │  Phân tích   │   │ Tải dữ liệu│
   │ hóa      │     │            │      │              │   │ theo AOI   │
   └────┬────┘     └─────┬─────┘      └──────┬──────┘   └─────┬─────┘
        │                │                   │                │
        └────────┬───────┴─────────┬─────────┴────────┬───────┘
                  │                 │                  │
           ┌──────▼──────┐   ┌──────▼──────┐   ┌───────▼───────┐
           │  GeoServer   │   │ PostgreSQL/  │   │  File Storage  │
           │ (WMS/WCS,    │   │ PostGIS      │   │  (NetCDF gốc,  │
           │ ImageMosaic) │   │ (stations,   │   │  D:\Data\...)  │
           │              │   │ observations,│   │                │
           │              │   │ events)      │   │                │
           └──────────────┘   └─────────────┘   └───────────────┘
```

---

## 4. Chi tiết các Module chức năng

### 4.1. Module Trực quan hóa (Visualization)

**Mục tiêu**: Hiển thị trực quan mọi loại dữ liệu trên một bản đồ nền thống nhất.

| Tính năng | Mô tả | Nguồn dữ liệu |
|---|---|---|
| Layer gió (vector field) | Hiển thị hướng/tốc độ gió dạng mũi tên hoặc streamline, có thanh trượt thời gian (Time Slider) | WRF3km, CMEMS, ERA5 (qua GeoServer ImageMosaic) |
| Layer nhiệt độ/SST/PMSL | Bản đồ nhiệt (heatmap) theo lưới | ERA5, SST-PMSL |
| Layer trạm quan trắc | Điểm trạm trên bản đồ, click để xem chi tiết đo đạc gần nhất | Bảng `stations`, `observations` |
| Đường đi bão / KKL | Vẽ track bão theo thời gian, animate theo timestep, hiển thị bán kính ảnh hưởng | Bảng `event_tracks`, `meteorological_events` |
| So sánh lớp (Layer comparison) | Hiển thị song song 2 layer (VD: WRF dự báo vs quan trắc thực tế) | Kết hợp GeoServer + PostGIS |
| Biểu đồ chuỗi thời gian tại điểm | Click vào 1 trạm → hiển thị biểu đồ (nhiệt độ, mưa, gió) theo thời gian | `observations` |

**Ghi chú kỹ thuật**: tận dụng GeoNode's MapStore/GeoExplorer làm khung UI có sẵn, tùy biến thêm widget Time Slider và biểu đồ (dùng thư viện như Chart.js/D3 nhúng vào GeoNode client).

---

### 4.2. Module Hỗ trợ Truy vấn (Query)

**Mục tiêu**: Cho phép người dùng không rành SQL vẫn truy vấn được dữ liệu qua giao diện form/filter.

| Loại truy vấn | Ví dụ nghiệp vụ | Cách triển khai |
|---|---|---|
| Truy vấn theo trạm + khoảng thời gian | "Lấy gió, nhiệt độ trạm Bạch Long Vĩ từ 01/01 - 31/01/2026" | Form chọn trạm (dropdown/map-click) + date range → query `observations` |
| Truy vấn không gian (spatial) | "Các trạm trong bán kính 100km quanh điểm X có gió > 10m/s" | `ST_DWithin` + filter điều kiện, expose qua GeoServer WFS hoặc REST API riêng |
| Truy vấn theo sự kiện | "Dữ liệu trạm nằm trong vùng ảnh hưởng bão Yagi tại thời điểm T" | Join `event_tracks` (bounding box/buffer) với `stations`/`observations` |
| Truy vấn lưới (gridded) theo điểm/vùng | "Giá trị u10m, v10m tại tọa độ (X,Y) lúc giờ H" | GeoServer WCS `GetCoverage` hoặc trích xuất qua Python (xarray) theo `netcdf_granules_index` |
| Truy vấn kết hợp đa nguồn | "So sánh mưa dự báo WRF và mưa thực đo tại trạm A ngày D" | Backend tổng hợp: 1 query PostGIS (trạm) + 1 query WCS (mô hình) → trả JSON hợp nhất |

**Đề xuất**: xây dựng một **Query API layer** (Django REST Framework, tích hợp trong GeoNode) làm trung gian, ẩn đi sự khác biệt giữa nguồn PostGIS và nguồn NetCDF/GeoServer, trả về JSON chuẩn hóa cho cả bản đồ và biểu đồ.

---

### 4.3. Module Phân tích (Analysis)

**Mục tiêu**: Cung cấp các phép tính/thống kê nghiệp vụ trên dữ liệu, không chỉ hiển thị thô.

| Tính năng phân tích | Mô tả |
|---|---|
| Thống kê tổng hợp theo trạm | Trung bình/max/min nhiệt độ, lượng mưa theo ngày/tháng/năm, có thể xuất báo cáo |
| Phân tích cực trị | Xác định các đợt nắng nóng, rét đậm, mưa lớn dựa trên ngưỡng người dùng định nghĩa |
| Phân tích quỹ đạo bão | Tính tốc độ di chuyển, hướng di chuyển, thời gian ảnh hưởng một khu vực cụ thể |
| Đánh giá sai số mô hình (Model Verification) | So sánh WRF/ERA5 dự báo với số liệu trạm thực đo (RMSE, bias) tại các điểm trùng vị trí |
| Phân tích không gian nâng cao | Nội suy (interpolation) giá trị giữa các trạm (IDW/Kriging) để tạo bản đồ liên tục |
| Cảnh báo ngưỡng (Threshold alert) | Tự động đánh dấu/khoanh vùng khi giá trị vượt ngưỡng (gió > cấp bão, mưa > 100mm/24h) |

**Đề xuất kỹ thuật**: các phép tính nặng (nội suy, RMSE, xử lý NetCDF) nên chạy như **tác vụ nền (Celery worker)** thay vì đồng bộ trong request, kết quả cache lại hoặc lưu vào bảng phân tích riêng (`analysis_results`) để tránh tính lại nhiều lần.

---

### 4.4. Module Tải dữ liệu theo Vùng quan tâm (AOI Download)

**Mục tiêu**: Người dùng vẽ/khoanh vùng (hoặc chọn trạm) và khoảng thời gian, hệ thống tự đóng gói dữ liệu tương ứng để tải về.

**Quy trình nghiệp vụ:**
1. Người dùng vẽ polygon/bbox trên bản đồ (dùng công cụ vẽ có sẵn của GeoNode/MapStore) hoặc chọn danh sách trạm.
2. Chọn loại dữ liệu (trạm quan trắc / lưới NetCDF / track bão) và khoảng thời gian.
3. Hệ thống:
   - Với dữ liệu trạm: query PostGIS theo `ST_Intersects(geom, aoi)` + khoảng thời gian → export CSV/Excel.
   - Với dữ liệu lưới NetCDF: dùng `netcdf_granules_index` để xác định file liên quan, sau đó dùng công cụ subset (VD: `xarray`, `NCO`, hoặc GeoServer WCS `GetCoverage` với bbox/time) để cắt vùng, tránh tải nguyên file gốc.
   - Với track bão/sự kiện: export GeoJSON/Shapefile.
4. Đóng gói kết quả (zip nếu nhiều định dạng) và tạo link tải hoặc gửi email khi xử lý xong (với vùng/khoảng thời gian lớn, xử lý bất đồng bộ).

**Định dạng xuất đề xuất**: CSV/Excel (trạm), NetCDF subset hoặc GeoTIFF (lưới), GeoJSON/Shapefile (vector: track, ranh giới).

**Lưu ý dung lượng**: cần giới hạn kích thước vùng/khoảng thời gian tải mỗi lần (VD: cảnh báo hoặc chặn nếu ước tính > X GB) để tránh quá tải hệ thống.

---

## 5. Luồng dữ liệu tổng thể (Data Flow)

```
[Nguồn dữ liệu gốc]
   NetCDF (WRF/ERA5/CMEMS)  --> ETL Index --> netcdf_granules_index (PostGIS)
   File trạm (Synop/KTTV)   --> ETL Parse --> stations / observations (PostGIS)
   File track bão/KKL       --> ETL Parse --> meteorological_events / event_tracks
   Dữ liệu vệ tinh ASCAT    --> Giải mã (Code python có sẵn) --> chuẩn hóa --> tương tự nhóm lưới/trạm

           │
           ▼
   [PostgreSQL/PostGIS] <--- GeoServer (đọc index để phục vụ WMS/WCS cho NetCDF gốc)
           │
           ▼
   [Query API layer - Django REST/GeoNode]
           │
           ▼
   [GeoNode Portal: Visualization | Query | Analysis | AOI Download]
```

---

## 6. Yêu cầu phi chức năng (Non-functional Requirements)

| Hạng mục | Yêu cầu đề xuất |
|---|---|
| Hiệu năng | Truy vấn time-series 1 trạm/1 tháng phải trả về < 2s; khuyến nghị dùng TimescaleDB nếu dữ liệu quan trắc tăng nhanh theo thời gian |
| Khả năng mở rộng | Thiết kế ETL dạng module hóa để dễ thêm nguồn dữ liệu mới (VD: thêm vệ tinh khác) |
| Phân quyền | Tích hợp cơ chế phân quyền có sẵn của GeoNode (theo layer, theo nhóm người dùng) |
| Giới hạn tải dữ liệu | Chặn/cảnh báo khi request AOI vượt ngưỡng dung lượng hoặc thời gian xử lý |
| Nhật ký & giám sát | Log lại các truy vấn/tải nặng để tối ưu sau này, giám sát dung lượng ổ đĩa NetCDF gốc |
| Sao lưu | Backup định kỳ CSDL PostGIS (metadata + dữ liệu trạm); dữ liệu NetCDF gốc backup riêng theo chính sách lưu trữ file |

---

## 7. Đề xuất lộ trình triển khai (Roadmap)

| Giai đoạn | Nội dung | Phụ thuộc |
|---|---|---|
| **Giai đoạn 1** | Thiết lập CSDL (theo `db_architecture_plan.md`), viết ETL nạp dữ liệu trạm (Synop/KTTV) và index NetCDF | Xác nhận 3 câu hỏi mở trong `db_architecture_plan.md` |
| **Giai đoạn 2** | Cấu hình GeoServer layer (ImageMosaic cho NetCDF, layer PostGIS cho trạm/track) + Module Trực quan hóa cơ bản | Giai đoạn 1 |
| **Giai đoạn 3** | Xây dựng Query API layer + giao diện truy vấn (form, spatial query) | Giai đoạn 2 |
| **Giai đoạn 4** | Module Phân tích (thống kê, verification, nội suy) chạy nền qua Celery | Giai đoạn 3 |
| **Giai đoạn 5** | Module AOI Download (export đa định dạng, xử lý bất đồng bộ cho vùng lớn) | Giai đoạn 2-3 |
| **Giai đoạn 6** | Kiểm thử hiệu năng, phân quyền, tối ưu (TimescaleDB nếu cần), triển khai chính thức | Tất cả |

---

## 8. Câu hỏi cần xác nhận thêm (bổ sung ngoài `db_architecture_plan.md`)

1. ~~Người dùng cuối chủ yếu là nội bộ hay có cần mở public một phần dữ liệu ra ngoài?~~ **Đã xác nhận**: hệ thống có thể public một phần dữ liệu ra ngoài (không chỉ giới hạn nội bộ) → cần thiết kế cơ chế phân quyền theo layer/nhóm dữ liệu để tách rõ phần công khai và phần hạn chế truy cập.
2. Có yêu cầu real-time (dữ liệu trạm cập nhật theo phút/giờ) hay chỉ cần batch theo ngày?
3. Định dạng xuất dữ liệu ưu tiên là gì (CSV, NetCDF subset, Shapefile, GeoTIFF...)?
4. Có giới hạn hạ tầng (RAM/CPU/storage server) cần lưu ý khi xử lý phân tích/nội suy không?
