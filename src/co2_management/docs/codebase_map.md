# CO2 Management Codebase Map

Tài liệu này ánh xạ cấu trúc thư mục, các file mã nguồn cốt lõi, mô hình CSDL (models), API endpoints và các kịch bản ETL trong module `co2_management`. Dành riêng cho Agent Code truy cập và định vị nhanh các file cần thiết.

---

## 📂 Sơ đồ cấu trúc thư mục (Directory Tree)

```text
src/co2_management/
├── docs/                             # Tài liệu đặc tả & thiết kế
│   ├── er_diagram_and_reference.md   # Thiết kế CSDL chi tiết & mô tả quan hệ các bảng
│   ├── functional_design.md          # Thiết kế chức năng hệ thống v1
│   ├── functional_design_v2.md       # Thiết kế chức năng hệ thống v2
│   ├── implementation_plan_v1.md     # Kế hoạch triển khai
│   ├── schema.md                     # Mô tả cấu trúc các cột/trường trong database
│   └── codebase_map.md               # Bản đồ mã nguồn (file này)
├── migrations/                       # Thư mục lưu lịch sử migration Django
├── templates/
│   └── co2_management/
│       └── react_app.html            # Template Django nhúng React SPA Dashboard
├── scripts/                          # Các kịch bản nạp dữ liệu vệ tinh
│   ├── import_gosat2.py              # Script ETL parse và import dữ liệu vệ tinh GOSAT-2 (.h5 / .nc)
│   └── import_oco2.py                # Script ETL parse và import dữ liệu vệ tinh OCO-2 (.nc)
├── services/                         # Chứa logic nghiệp vụ lõi tách biệt khỏi views
├── static/                           # Tài nguyên tĩnh của module
├── tasks.py                          # Celery Tasks xử lý import/phân tích chạy nền
├── models.py                         # Định nghĩa toàn bộ Models (Django ORM + GeoDjango)
├── views.py                          # Django REST Framework ViewSets (API endpoints)
├── template_views.py                 # Django Class-Based Views cho trang giao diện chính
├── api_urls.py                       # Cấu hình routes API v1 của module
├── urls.py                           # Định tuyến URL chính (Dashboard & APIs)
├── serializers.py                    # Serializers định nghĩa cấu trúc dữ liệu JSON API
├── apps.py                           # Cấu hình Django App
└── admin.py                          # Cấu hình giao diện Admin Django
```

---

## 🗃️ Bản đồ Models & Database (`models.py`)

Tất cả bảng dữ liệu của co2_management đều bắt đầu bằng tiền tố Django mặc định hoặc được ánh xạ cụ thể trong Postgres.

| Tên Model Django | Chức năng & Vai trò |
| :--- | :--- |
| [Satellite](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L50) | Lưu thông tin chi tiết về các vệ tinh quan trắc CO2 (OCO-2, GOSAT-2) |
| [SatelliteInstrument](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L66) | Thiết bị/công cụ đo đạc gắn trên vệ tinh (ví dụ: TANSO-FTS-2) |
| [MeasurementSource](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L81) | Quản lý các tệp dữ liệu đo đạc thô đã nhập vào hệ thống |
| [MeasurementMetadata](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L100) | Thông tin thống kê tổng hợp (XCO2 min, max, mean...) từ một nguồn dữ liệu |
| [Measurement](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L113) | Dữ liệu đo đạc chi tiết cho từng điểm quan trắc (sounding) có lưu geometry `Point` |
| [VerticalProfile](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L144) | Dữ liệu hồ sơ thẳng đứng nồng độ CO2 tại từng tầng khí quyển của điểm đo |
| [QualityAssessment](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L161) | Kết quả đánh giá chất lượng chi tiết (Quality score 0-100) của điểm đo |
| [MonitoringLocation](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L175) | Các vị trí địa lý trọng điểm cần giám sát nồng độ CO2 thường xuyên |
| [TemporalSeries](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L196) | Dữ liệu chuỗi thời gian nồng độ CO2 tại các địa điểm giám sát |
| [AnalysisJob](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L210) | Quản lý và giám sát tiến trình các yêu cầu phân tích dữ liệu chạy nền |
| [DataComparison](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L226) | Kết quả đối chiếu chênh lệch nồng độ XCO2 giữa OCO-2 và GOSAT-2 |
| [AuditLog](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L241) | Nhật ký hệ thống theo dõi các thao tác thay đổi dữ liệu trong mô-đun |
| [Station](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L257) | Lưu thông tin danh mục tĩnh các trạm quan trắc chất lượng không khí (bảng `stations`) |
| [StationMeasurement](file:///D:/Research/Geonode/geonode-project/src/co2_management/models.py#L278) | Chuỗi thời gian dữ liệu ô nhiễm không khí (PM1, PM2.5, PM10, CO, NO2, SO2...) theo trạm (bảng `station_measurements`) |

---

## 🔌 API Endpoints (`api_urls.py` & `views.py`)

Tất cả các endpoints REST API của module CO2 được đăng ký qua `DefaultRouter`:

| Route URL | Viewset phụ trách | Chức năng chính |
| :--- | :--- | :--- |
| `api/v1/dashboard/` | [DashboardViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L12) | API cung cấp dữ liệu tổng quan, biểu đồ cho dashboard |
| `api/v1/statistics/` | [StatisticsViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L13) | Thống kê số liệu nồng độ CO2 theo thời gian và không gian |
| `api/v1/satellites/` | [SatelliteViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L14) | Quản lý thông số các vệ tinh |
| `api/v1/sources/` | [MeasurementSourceViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L15) | Endpoint quản lý tệp dữ liệu vệ tinh đã tải lên |
| `api/v1/measurements/` | [MeasurementViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L16) | Lọc, tìm kiếm các điểm đo đạc nồng độ XCO2 |
| `api/v1/locations/` | [MonitoringLocationViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L17) | Quản lý các điểm giám sát và vùng bán kính quan tâm |
| `api/v1/comparisons/` | [DataComparisonViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L18) | API truy xuất kết quả đối so sánh OCO2 vs GOSAT2 |
| `api/v1/jobs/` | [AnalysisJobViewSet](file:///D:/Research/Geonode/geonode-project/src/co2_management/api_urls.py#L19) | Endpoint quản lý, theo dõi tiến độ các job phân tích nồng độ CO2 |

---

## 🎨 Bản đồ Frontend React (`frontend/src/co2_management/`)

Mã nguồn Frontend React của module được cấu trúc như sau:

- **Điểm gắn kết (Mount Point)**: Nhúng vào Django template thông qua thẻ `div` có `id="co2-management-root"` tại [react_app.html](file:///D:/Research/Geonode/geonode-project/src/co2_management/templates/co2_management/react_app.html).
- **Ứng dụng chính**: [CO2ManagementApp.tsx](file:///D:/Research/Geonode/geonode-project/frontend/src/co2_management/CO2ManagementApp.tsx) - Điểm bắt đầu khởi tạo cấu trúc trang SPA.
- **Thư mục components/**: Các UI component dùng riêng cho giám sát & theo dõi CO2 (Map view, Stats widgets, Comparison table).
- **Thư mục pages/**: Chứa các màn hình chức năng chính (Dashboard, So sánh dữ liệu OCO-2 & GOSAT-2, Phân tích xu hướng Trend, Danh sách các job chạy nền).
- **Thư mục store/**: Quản lý Global State phục vụ đồng bộ dữ liệu bản đồ, dữ liệu thống kê qua các view.


