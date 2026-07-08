# Mining Detection Codebase Map

Tài liệu này ánh xạ cấu trúc thư mục, các file mã nguồn cốt lõi, mô hình CSDL (models), các view, form và API trong module `mining_detection`. Dành riêng cho Agent Code truy cập và định vị nhanh các file cần thiết.

---

## 📂 Sơ đồ cấu trúc thư mục (Directory Tree)

```text
src/mining_detection/
├── docs/                             # Tài liệu đặc tả & thiết kế
│   └── codebase_map.md               # Bản đồ mã nguồn (file này)
├── migrations/                       # Thư mục lưu lịch sử migration Django
├── templates/
│   └── mining_detection/             # Django templates dùng cho MVT views (Dashboard, detail, list, forms...)
├── models.py                         # Định nghĩa Models giám sát khai thác khoáng sản (Jobs, Site, Violation)
├── views.py                          # Xử lý API upload dữ liệu từ AI Service
├── template_views.py                 # Django Class-Based Views phục vụ giao diện portal chính (MVT)
├── urls.py                           # Định tuyến URL cho view và APIs (chứa routing danh mục reference)
├── api_urls.py                       # Route API upload nhỏ gọn
├── serializers.py                    # Serializers cho API upload dữ liệu detection
├── services.py                       # Tích hợp cổng AI Service (POST /analyze) để gửi job phân tích
├── tasks.py                          # Celery Tasks chạy nền kiểm tra trạng thái job và đồng bộ layer
├── tasks_utils.py                    # Tiện ích bổ trợ cho các Celery tasks
├── forms.py                          # Django Forms cho các trang tạo mới/cập nhật thực thể
├── apps.py                           # Cấu hình Django App
├── admin.py                          # Cấu hình Admin Django cho tất cả các mô hình giám sát
└── tests.py                          # Unit tests kiểm tra luồng tạo và đồng bộ job
```

---

## 🗃️ Bản đồ Models & Database (`models.py`)

Tập hợp các mô hình CSDL quản lý tiến trình phân tích ảnh vệ tinh và thực trạng khai thác khoáng sản.

| Tên Model Django | Chức năng & Vai trò |
| :--- | :--- |
| [MiningDetectionJob](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L18) | Quản lý tiến trình job gửi sang AI service, lưu vết tiến trình (%) và các dataset GeoNode kết quả |
| [InferenceStatistics](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L150) | Thống kê diện tích phát hiện (ha), mật độ phân tích chỉ số NDVI, NDWI, BSI |
| [MineralType](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L183) | Danh mục các loại khoáng sản được giám sát trong hệ thống |
| [CoordinateSystem](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L198) | Danh mục hệ tọa độ dùng cho các bản đồ bản vẽ dự án |
| [Province](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L225) | Danh mục Tỉnh/Thành phố |
| [District](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L238) | Danh mục Quận/Huyện |
| [Ward](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L253) | Danh mục Xã/Phường |
| [PlanningZone](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L268) | Vùng quy hoạch khai thác khoáng sản (Polygon) |
| [MiningSite](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L309) | Thông tin mỏ khai thác được cấp phép (Polygon) |
| [MiningSiteDocument](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L380) | Các tài liệu pháp lý đính kèm mỏ (giấy phép, bản vẽ...) |
| [SiteMonitoring](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L408) | Cấu hình tần suất tự động quét giám sát mỏ |
| [DetectionViolation](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L461) | Hồ sơ ghi nhận vi phạm phát hiện tự động (vượt ranh giới, không phép) |
| [ViolationLog](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L525) | Nhật ký xử lý và cập nhật tiến trình khắc phục vi phạm |
| [ViolationAttachment](file:///D:/Research/Geonode/geonode-project/src/mining_detection/models.py#L559) | Hình ảnh chứng minh, tài liệu đính kèm của biên bản vi phạm |

---

## 🔌 API & View Routes (`urls.py`)

Module sử dụng cả Django MVT (Template views) cho giao diện quản trị và REST APIs cho tích hợp:

| Route URL | Loại View | Mục đích chính |
| :--- | :--- | :--- |
| `/` | [DashboardView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L150) | Trang chủ thống kê chung về các mỏ và vi phạm khai thác |
| `sites/` | [MiningSiteListView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L151) | Quản lý danh sách mỏ khai thác |
| `monitoring/` | [MonitoringListView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L157) | Quản lý kế hoạch giám sát định kỳ mỏ |
| `violations/` | [ViolationListView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L162) | Quản lý danh sách biên bản vi phạm khai thác |
| `jobs/` | [JobListView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L167) | Quản lý tiến trình gửi và phân tích ảnh vệ tinh tự động |
| `jobs/<pk>/status/` | [job_status_api](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L173) | API trả về tiến trình (%) xử lý của AI service |
| `reference/<slug>/` | [ReferenceListView](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L201) | Quản lý danh mục nền (Hệ tọa độ, Loại khoáng sản, Tỉnh/Huyện/Xã...) |
| `<execution_id>/upload-result` | [UploadExecution](file:///D:/Research/Geonode/geonode-project/src/mining_detection/urls.py#L175) | API để AI service đẩy kết quả phân tích về Django |

