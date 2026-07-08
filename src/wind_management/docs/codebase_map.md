# Wind Management Codebase Map

Tài liệu này ánh xạ cấu trúc thư mục, các file mã nguồn cốt lõi, mô hình CSDL (models), API endpoints và các kịch bản ETL trong module `wind_management`. Dành riêng cho Agent Code truy cập và định vị nhanh các file cần thiết.

---

## 📂 Sơ đồ cấu trúc thư mục (Directory Tree)

```text
src/wind_management/
├── docs/                             # Tài liệu đặc tả & thiết kế
│   ├── business_design (winds).md    # Thiết kế nghiệp vụ, quy trình tổng thể
│   ├── data_summary.md               # Mô tả cấu trúc các nguồn dữ liệu gốc (WRF, ERA5, SYNOP, ASCAT...)
│   ├── database_design (winds).md    # Thiết kế chi tiết các bảng SQL
│   ├── functional_design (winds).md  # Thiết kế chức năng (Visualization, Query, Analysis, AOI Download)
│   └── codebase_map.md               # Bản đồ mã nguồn (file này)
├── migrations/                       # Thư mục lưu lịch sử migration Django
├── templates/
│   └── wind_management/
│       └── react_app.html            # Template Django nhúng SPA React
├── scripts/                          # Các kịch bản chạy CMD/ETL
│   ├── import_netcdf_metadata.py     # ETL quét NetCDF và điền vào raster_granules_index
│   ├── import_synop.py               # ETL parse file SYNOP (.txt) nạp vào observations
│   └── kttv_bulk_import.py           # ETL nạp dữ liệu lịch sử trạm KTTV
├── models.py                         # Định nghĩa toàn bộ Models (Django ORM + GeoDjango)
├── views.py                          # Django REST Framework ViewSets (API endpoints)
├── template_views.py                 # Django Class-Based Views cho trang giao diện chính
├── urls.py                           # Định tuyến URL cho API v1 và React App
├── serializers.py                    # Serializers chuyển đổi dữ liệu cho API REST
├── apps.py                           # Cấu hình Django App
└── admin.py                          # Cấu hình giao diện Admin Django
```

---

## 🗃️ Bản đồ Models & Database (`models.py`)

Tất cả bảng dữ liệu trong cơ sở dữ liệu đều có tiền tố `wind_`.

| Tên Model Django | Tên bảng SQL (`db_table`) | Chức năng & Vai trò |
| :--- | :--- | :--- |
| [Dataset](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L7) | `wind_datasets` | Catalog lưu thông tin chung về tập dữ liệu (GRIDDED, STATION, SATELLITE, EVENT) |
| [DatasetVariable](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L41) | `wind_dataset_variables` | Khai báo các biến có sẵn trong từng Dataset (vd: `u10m`, `v10m`, `rain_24h`) |
| [DatasetAccessPolicy](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L51) | `wind_dataset_access_policies` | Phân quyền xem, truy vấn, tải dữ liệu của Dataset theo Group |
| [Station](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L62) | `wind_stations` | Lưu thông tin vị trí hình học (`PointField`), mã và tên các trạm quan trắc |
| [Observation](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L75) | `wind_observations` | Số liệu đo đạc chi tiết (nhiệt độ, mưa, gió...) theo thời gian của từng trạm |
| [MeteorologicalEvent](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L95) | `wind_meteorological_events` | Quản lý danh mục sự kiện thời tiết đặc biệt như bão (Typhoon), không khí lạnh |
| [EventTrack](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L110) | `wind_event_tracks` | Đường đi (quỹ đạo) chi tiết theo thời gian của sự kiện thời tiết |
| [RasterGranuleIndex](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L125) | `wind_raster_granules_index` | Chỉ mục siêu dữ liệu lưới/NetCDF (thời gian, độ sâu, footprint, file path) |
| [AnalysisJob](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L139) | `wind_analysis_jobs` | Theo dõi các tác vụ tính toán, phân tích chạy nền (Celery) |
| [AnalysisResult](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L156) | `wind_analysis_results` | Kết quả chi tiết của tác vụ phân tích (RMSE, Bias, Grid points...) |
| [ExtremeEvent](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L169) | `wind_extreme_events` | Lưu vết các đợt nắng nóng, rét đậm, mưa lớn cực đoan được phát hiện |
| [AlertRule](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L184) | `wind_alert_rules` | Cấu hình luật cảnh báo tự động vượt ngưỡng theo vùng địa lý |
| [AlertNotification](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L198) | `wind_alert_notifications` | Các thông báo cảnh báo đã được kích hoạt khi dữ liệu cập nhật vượt ngưỡng |
| [DownloadRequest](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L211) | `wind_download_requests` | Yêu cầu trích xuất/tải dữ liệu theo vùng quan tâm (AOI) |
| [DownloadRequestItem](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L230) | `wind_download_request_items` | Chi tiết định dạng xuất, biến cần tải của từng Dataset trong yêu cầu tải |
| [DownloadFile](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L239) | `wind_download_files` | Lưu vết đường dẫn file kết quả xuất dữ liệu đã được đóng gói vật lý |
| [UserQueryHistory](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L248) | `wind_user_query_history` | Nhật ký truy vấn dữ liệu của người dùng |
| [IngestionLog](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L260) | `wind_ingestion_logs` | Nhật ký tiến trình nạp dữ liệu ETL |
| [SystemMetric](file:///D:/Research/Geonode/geonode-project/src/wind_management/models.py#L272) | `wind_system_metrics` | Số liệu giám sát sức khỏe và tài nguyên hệ thống |

---

## 🔌 Định tuyến URLs & API Endpoints (`urls.py` & `views.py`)

Tất cả các API REST nằm dưới đường dẫn: `/wind/api/v1/` (hoặc prefix được cấu hình trong dự án chính).

| Endpoint API v1 | Viewset xử lý | Chức năng chính |
| :--- | :--- | :--- |
| `api/v1/datasets/` | [DatasetViewSet](file:///D:/Research/Geonode/geonode-project/src/wind_management/urls.py#L12) | Liệt kê, thêm, sửa đổi thông tin các tập dữ liệu khí tượng/hải dương |
| `api/v1/stations/` | [StationViewSet](file:///D:/Research/Geonode/geonode-project/src/wind_management/urls.py#L13) | Quản lý danh sách trạm quan trắc (đã kèm latest_observation trong danh sách trạm, hỗ trợ truy vấn không gian) |
| `api/v1/observations/` | [ObservationViewSet](file:///D:/Research/Geonode/geonode-project/src/wind_management/urls.py#L14) | Tìm kiếm số liệu đo đạc lịch sử của trạm theo khoảng thời gian |
| `api/v1/events/` | [MeteorologicalEventViewSet](file:///D:/Research/Geonode/geonode-project/src/wind_management/urls.py#L15) | Truy xuất danh sách cơn bão, không khí lạnh và track tâm bão |
| `api/v1/raster-granules/` | [RasterGranuleIndexViewSet](file:///D:/Research/Geonode/geonode-project/src/wind_management/urls.py#L16) | Tra cứu metadata và đường dẫn của các tệp NetCDF theo lưới tọa độ/thời gian |

---

## 🎨 Bản đồ Frontend React (`frontend/src/wind_management/`)

Mã nguồn Frontend React của module được cấu trúc như sau:

- **Điểm gắn kết (Mount Point)**: Nhúng vào Django template thông qua thẻ `div` có `id="wind-management-root"` tại [react_app.html](file:///D:/Research/Geonode/geonode-project/src/wind_management/templates/wind_management/react_app.html).
- **Ứng dụng chính**: [WindManagementApp.tsx](file:///D:/Research/Geonode/geonode-project/frontend/src/wind_management/WindManagementApp.tsx) - Điểm bắt đầu khởi tạo cấu trúc trang SPA.
- **Thư mục components/**: Các UI component dùng riêng cho giám sát gió & hải dương (bản đồ WindMap, panel điều khiển).
- **Thư mục pages/**: Chứa các màn hình chức năng chính (Dashboard, So sánh lớp dữ liệu song song, Lịch sử truy vấn).
- **Thư mục stores/**: Quản lý Global State bằng Zustand hoặc Redux phục vụ đồng bộ thanh trượt thời gian (Time Slider) và hiển thị trạm.


