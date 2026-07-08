# Carbon Tracker Codebase Map

Tài liệu này ánh xạ cấu trúc thư mục, các file mã nguồn cốt lõi, mô hình CSDL (models), API endpoints và các kịch bản nạp dữ liệu vệ tinh trong module `carbon_tracker`. Dành riêng cho Agent Code truy cập và định vị nhanh các file cần thiết.

---

## 📂 Sơ đồ cấu trúc thư mục (Directory Tree)

```text
src/carbon_tracker/
├── docs/                             # Tài liệu đặc tả & thiết kế
│   └── codebase_map.md               # Bản đồ mã nguồn (file này)
├── migrations/                       # Thư mục lưu lịch sử migration Django
├── templates/
│   └── carbon_tracker/
│       └── index.html                # Template Django nhúng frontend của carbon tracker
├── static/                           # Assets tĩnh phục vụ cho giao diện carbon_tracker
├── models.py                         # Định nghĩa toàn bộ Models (OCO-2 & GOSAT-2 soundings/profiles)
├── views.py                          # Django API Views & Template Views
├── api_views.py                      # Chứa các API View khác
├── query.py                          # Logic truy vấn / subset dữ liệu không gian và thời gian
├── missions.py                       # Ingestion logic xử lý định dạng tệp vệ tinh OCO2 và GOSAT2
├── urls.py                           # Định tuyến URL cho view và APIs
├── serializers.py                    # Serializers định nghĩa cấu trúc dữ liệu JSON API
├── apps.py                           # Cấu hình Django App
├── admin.py                          # Cấu hình giao diện Admin Django
└── tests.py                          # Unit tests kiểm tra ingestion và truy vấn
```

---

## 🗃️ Bản đồ Models & Database (`models.py`)

Tất cả bảng dữ liệu của carbon_tracker lưu thông tin vệ tinh thô và soundings chi tiết.

| Tên Model Django | Tên bảng SQL (`db_table`) | Chức năng & Vai trò |
| :--- | :--- | :--- |
| [OCO2Data](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L6) | Mặc định | Dữ liệu nồng độ XCO2 toàn cầu từ vệ tinh OCO-2 |
| [VietNamOCO2Data](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L24) | `carbon_tracker_vietnam_oco2data` | Phân đoạn dữ liệu OCO-2 cắt riêng cho khu vực Việt Nam |
| [GosatProduct](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L60) | `gosat_product` | Metadata tệp đầu vào GOSAT-2 (H5) |
| [Sounding](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L107) | `gosat_sounding` | Các điểm đo đạc sounding riêng lẻ của GOSAT-2 |
| [RetrievalResult](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L166) | `gosat_retrieval_result` | Kết quả truy hồi khí (XCO2, XCH4, XCO...) chi tiết của từng sounding |
| [CloudInformation](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/models.py#L236) | Mặc định | Dữ liệu mây hỗ trợ kiểm thử chất lượng cho sounding |

---

## 🔌 API Endpoints (`urls.py` & `views.py`)

Tất cả các endpoints REST API của module Carbon Tracker:

| Route URL | View phụ trách | Chức năng chính |
| :--- | :--- | :--- |
| `/` | [CarbonTrackerViewIndex](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L9) | Trang giao diện chính hiển thị bản đồ |
| `api/carbons/` | [CarbonTrackerDataListAPIView](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L15) | API danh sách dữ liệu carbon được query theo thời gian/tọa độ |
| `api/summary/` | [CarbonTrackerSummaryAPIView](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L16) | API thống kê nhanh các thông số XCO2 |
| `api/timeseries/` | [CarbonTrackerTimeseriesAPIView](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L17) | API chuỗi thời gian tại điểm chọn |
| `api/aoi/summary/` | [CarbonTrackerAOISummaryAPIView](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L18) | API tổng kết thống kê theo vùng quan tâm AOI |
| `api/records/<record_key>/file-detail/` | [CarbonTrackerFileDetailAPIView](file:///D:/Research/Geonode/geonode-project/src/carbon_tracker/urls.py#L19) | API thông tin chi tiết của một tệp cụ thể |

