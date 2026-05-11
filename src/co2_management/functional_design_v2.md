# 🛰️ Thiết Kế Chức Năng v2: CO2 Management System

## 📋 Mục Lục
1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Trạng Thái Triển Khai Hiện Tại](#2-trạng-thái-triển-khai-hiện-tại)
3. [Chi Tiết Chức Năng Cần Thực Hiện (Action Plan)](#3-chi-tiết-chức-năng-cần-thực-hiện-action-plan)
   - [Module 4: Giám Sát Địa Lý (Geospatial Monitoring)](#module-4-giám-sát-địa-lý-geospatial-monitoring)
   - [Module 5: So Sánh Dữ Liệu (Cross-Validation)](#module-5-so-sánh-dữ-liệu-cross-validation)
   - [Module 6: Công Việc Phân Tích (Analysis Jobs)](#module-6-công-việc-phân-tích-analysis-jobs)
   - [Module 7: Quản Trị Hệ Thống (Administration)](#module-7-quản-trị-hệ-thống-administration)
4. [Khuyến Nghị Cải Thiện Schema (Roadmap Kỹ Thuật)](#4-khuyến-nghị-cải-thiện-schema-roadmap-kỹ-thuật)

---

## 1. Tổng Quan Hệ Thống

Hệ thống quản lý, phân tích và đối chiếu dữ liệu CO2 từ vệ tinh **OCO-2** (NASA) và **GOSAT-2** (JAXA) trên nền tảng Django/GeoNode. Mục tiêu cốt lõi là cung cấp khả năng lưu trữ không gian (PostGIS), phân tích chuỗi thời gian, và đánh giá chéo (cross-validation) dữ liệu từ các thiết bị đo phổ khác nhau để phục vụ nghiên cứu môi trường.

---

## 2. Trạng Thái Triển Khai Hiện Tại

Dựa trên phân tích mã nguồn (`models.py`, `views.py`, `urls.py`), hệ thống đã hoàn thiện các nền tảng sau:
- ✅ **Database Schema**: Cấu trúc bảng vững chắc, đã tích hợp Soft Delete (`deleted_at`) cho Measurements và liên kết N-N (`ManyToManyField`) cho Analysis Jobs.
- ✅ **API Cơ Bản**: Các ViewSet cho CRUD Vệ tinh, Nguồn dữ liệu, Điểm đo, Vị trí giám sát đã được dựng khung.
- ✅ **Truy Vấn Không Gian**: Đã hỗ trợ lọc Bounding Box và thống kê bán kính cơ bản sử dụng PostGIS.

**Trọng tâm phát triển tiếp theo** là biến hệ thống từ lưu trữ đơn thuần thành một nền tảng phân tích (Analytics) thực thụ bằng cách hoàn thiện các Module 4, 5 và 6.

---

## 3. Chi Tiết Chức Năng Cần Thực Hiện (Action Plan)

Dưới đây là mô tả chi tiết các chức năng cần được lập trình, tập trung vào luồng xử lý và API đầu ra.

### Module 4: 📍 Giám Sát Địa Lý (Geospatial Monitoring)

**Mục tiêu:** Cung cấp công cụ trực quan để theo dõi nồng độ XCO2 tại các khu vực xác định (thành phố, khu công nghiệp, trạm nghiên cứu).

*   **F4.1 - Hoàn thiện API Time Series (`/api/v1/locations/{id}/timeseries/`)**
    *   **Mô tả:** Truy xuất chuỗi dữ liệu thời gian XCO2 trung bình theo ngày/tháng tại một vị trí giám sát.
    *   **Chi tiết thực hiện:**
        *   Hiện tại đang query từ bảng vật lý `TemporalSeries`. Cần đảm bảo dữ liệu trong bảng này được cập nhật tự động (hoặc qua job) khi có `Measurement` mới.
        *   Output phải tương thích trực tiếp với thư viện frontend (ví dụ: Chart.js format).
*   **F4.2 - Tính toán Thống kê Vùng (`/api/v1/locations/{id}/statistics/`)**
    *   **Mô tả:** Tính toán giá trị Min, Max, Mean XCO2 và tổng số điểm đo trong bán kính (`radius_km`) của một vị trí.
    *   **Chi tiết thực hiện:** Sử dụng hàm không gian `distance_lte` của PostGIS kết hợp với `Aggregate` (Avg, Max, Min). Đảm bảo truy vấn được index bằng GIST.
*   **F4.3 - Bản đồ Nhiệt (Heatmap Generator)**
    *   **Mô tả:** Tạo dữ liệu đầu vào cho lớp bản đồ nhiệt (Heatmap layer) trên frontend.
    *   **Chi tiết thực hiện:** Xây dựng API `/api/v1/map/heatmap/` (hoặc mở rộng action `spatial_query` của `MeasurementViewSet`). API trả về định dạng GeoJSON hoặc mảng cấu trúc `[lat, lon, intensity]` dựa trên giá trị `xco2_ppm` đã chuẩn hóa. Cần có cơ chế caching hoặc limit điểm để không làm treo trình duyệt.

### Module 5: 🔄 So Sánh Dữ Liệu (Cross-Validation)

**Mục tiêu:** Đánh giá độ tin cậy của dữ liệu bằng cách so sánh chéo các phép đo từ OCO-2 và GOSAT-2 diễn ra gần nhau về không gian và thời gian.

*   **F5.1 - Thuật toán Co-location (Tìm điểm trùng khớp)**
    *   **Mô tả:** Logic cốt lõi để tìm các cặp điểm OCO-2 và GOSAT-2 "gần nhau".
    *   **Chi tiết thực hiện:**
        *   Viết service (ví dụ: `comparison_service.py`) nhận vào khoảng thời gian.
        *   Sử dụng PostGIS `DWithin` (Distance Within) để tìm các cặp điểm cách nhau $< 50km$.
        *   Lọc thêm điều kiện thời gian: chênh lệch $< 1$ giờ.
        *   Tính chênh lệch `xco2_difference_ppm`.
        *   Lưu kết quả vào bảng `DataComparison`.
*   **F5.2 - Báo cáo So Sánh Thống Kê (`/api/v1/comparisons/report/`)**
    *   **Mô tả:** Tổng hợp dữ liệu từ `DataComparison` thành các chỉ số đánh giá.
    *   **Chi tiết thực hiện:** Tính toán các chỉ số:
        *   **Bias (Độ lệch chuẩn trung bình):** $\Sigma(OCO2 - GOSAT2) / N$
        *   **RMSE (Root Mean Square Error):** $\sqrt{\Sigma(OCO2 - GOSAT2)^2 / N}$
        *   Trả kết quả qua API để render Dashboard.
*   **F5.3 - API Scatter Plot**
    *   **Mô tả:** Cung cấp dữ liệu để vẽ biểu đồ tương quan (Scatter plot).
    *   **Chi tiết thực hiện:** Trả về danh sách các cặp giá trị `{"x": oco2_val, "y": gosat2_val}`.

### Module 6: ⚙️ Công Việc Phân Tích (Analysis Jobs)

**Mục tiêu:** Xử lý các tác vụ nặng (như tính toán F5.1, xuất dữ liệu lớn) chạy ngăm để không làm block Web Server.

*   **F6.1 - Tích hợp Celery Worker**
    *   **Mô tả:** Thiết lập hạ tầng xử lý bất đồng bộ.
    *   **Chi tiết thực hiện:**
        *   Tạo file `tasks.py` trong ứng dụng `co2_management`.
        *   Định nghĩa các hàm task: `run_comparison_job(job_id)`, `export_measurements_job(job_id, params)`.
*   **F6.2 - Quản lý Vòng đời Job (`/api/v1/jobs/`)**
    *   **Mô tả:** Khởi tạo, theo dõi và hủy job.
    *   **Chi tiết thực hiện:**
        *   Khi tạo Job (POST), tự động enqueue Celery task và đổi trạng thái thành `PENDING`.
        *   Celery task khi chạy sẽ cập nhật status -> `RUNNING` và field `progress_percent`.
        *   API lấy chi tiết Job sẽ trả về `progress_percent` để frontend làm thanh tiến trình (progress bar).
        *   Khi hoàn thành, lưu đường dẫn file kết quả vào `result_path` và đổi status -> `COMPLETED`.
*   **F6.3 - Hủy Job (Cancel)**
    *   **Mô tả:** Cho phép người dùng dừng tác vụ đang chạy.
    *   **Chi tiết thực hiện:** Hoàn thiện action `/api/v1/jobs/{id}/cancel/`. Cần lưu `celery_task_id` vào model `AnalysisJob` để gọi lệnh `revoke` của Celery.

### Module 7: 👥 Quản Trị Hệ Thống (Administration)

**Mục tiêu:** Quản lý và theo dõi sức khỏe ứng dụng.

*   **F7.1 - Cải tiến Dashboard Admin**
    *   **Mô tả:** Bổ sung các biểu đồ tổng quan về dữ liệu hệ thống.
    *   **Chi tiết thực hiện:** Cập nhật `DashboardView` để render các thống kê: Tổng số Measurements theo nguồn, Số lượng Jobs thất bại/thành công, Dung lượng dữ liệu đã lưu trữ.

---

## 4. Khuyến Nghị Cải Thiện Schema (Roadmap Kỹ Thuật)

Trong quá trình thực hiện các chức năng trên, có một số tái cấu trúc (refactoring) cần thực hiện song song để tối ưu hiệu năng:

1.  **Refactor `TemporalSeries` (P1 - High Priority):**
    *   **Vấn đề:** Bảng `TemporalSeries` hiện tại là bảng vật lý, việc duy trì dữ liệu đồng bộ với bảng `Measurement` khổng lồ rất phức tạp và dễ gây sai sót.
    *   **Giải pháp:** Thay thế bằng **PostgreSQL Materialized View**. View này sẽ tự động tổng hợp (GROUP BY theo location_id, theo ngày) và lưu kết quả. Thiết lập một Celery task nhỏ để `REFRESH MATERIALIZED VIEW CONCURRENTLY` định kỳ (ví dụ: mỗi đêm hoặc sau khi có batch import mới).
2.  **Đơn giản hóa `MeasurementMetadata` (P2 - Medium Priority):**
    *   **Vấn đề:** `MeasurementMetadata` có quan hệ 1-1 chặt chẽ với `MeasurementSource`. Việc tách bảng làm tăng chi phí JOIN khi lấy danh sách file.
    *   **Giải pháp:** Đưa các trường `min_xco2`, `max_xco2`, `mean_xco2` trực tiếp vào bảng `MeasurementSource`.
3.  **Tối ưu Indexing cho Không gian (P1):**
    *   Đảm bảo trường `geom` của `Measurement` và `MonitoringLocation` đã được đánh `GIST` index.
    *   Tạo composite index cho các trường thường dùng để lọc: `(data_source, measurement_time, xco2_quality_flag)`.
