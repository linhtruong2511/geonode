# Báo cáo Tổng hợp Dữ liệu Khí tượng, Gió và Hải dương học

Tài liệu này tổng hợp cấu trúc, định dạng và đặc tính của các tập dữ liệu hiện có trong thư mục `D:\Data\Winds`. Tổng dung lượng ước tính của toàn bộ dữ liệu rơi vào khoảng 20 - 30 GB.

Dữ liệu được chia làm 4 nhóm chính: Dữ liệu mô hình/lưới (Gridded Data), Dữ liệu trạm quan trắc (Station Data), Dữ liệu vệ tinh (Satellite Data) và Dữ liệu chuyên đề.

---

## 1. Dữ liệu Mô hình và Lưới (Gridded Data / NetCDF)

Đây là các dữ liệu đa chiều không gian và thời gian, được lưu trữ chủ yếu dưới chuẩn định dạng **NetCDF (.nc)**.

### 1.1. Dữ liệu Mô hình khu vực WRF 3km
*   **Thư mục**: `wrf3km_cut/`
*   **Định dạng**: `.nc` (chia theo từng giờ, ví dụ `2019010100.nc`)
*   **Phạm vi không gian**: Phủ trùm khu vực Biển Đông và Việt Nam (Vĩ độ: ~17°N - 21°N, Kinh độ: ~105°E - 110°E).
*   **Độ phân giải**: Rất cao (3km).
*   **Biến (Variables) chính**:
    *   `u10m`: Thành phần gió Đông-Tây ở độ cao 10m (m/s).
    *   `v10m`: Thành phần gió Bắc-Nam ở độ cao 10m (m/s).

### 1.2. Dữ liệu Tái phân tích ERA5
*   **File chính**: `era5_Do-sau-bien.nc` và thư mục `era5flip/`
*   **Định dạng**: `.nc` (tuân thủ CF-1.7 Conventions).
*   **Biến chính**: `wmb` (liên quan đến độ sâu lớp trộn đại dương / water mixed layer).
*   **Phạm vi**: Lưới toàn cầu (Latitude: 90 đến -90, Longitude: 0 đến 359.5).

### 1.3. Dữ liệu Hải dương Copernicus (CMEMS)
*   **Thư mục**: `wind_ocean_gridded_ChauAu-003/data_cmems/`
*   **Đặc điểm**: Dữ liệu gió bề mặt đại dương được cấu trúc theo từng năm (từ 1995 đến 2024).

### 1.4. Dữ liệu Nhiệt độ mặt biển và Áp suất (SST & PMSL)
*   **Thư mục**: `nhiệt độ bề mặt biển (sst) và áp suất mực biển (pmsl)/`
*   **Nội dung**: Chứa các thông số hải dương học cơ bản (SST - Sea Surface Temperature, PMSL - Pressure at Mean Sea Level).

---

## 2. Dữ liệu Quan trắc Trạm (Point/Station Data)

Dữ liệu thu thập từ các trạm đo đạc thực tế, được lưu trữ dưới dạng text/bảng biểu.

### 2.1. Quan trắc SYNOP (189 trạm)
*   **Thư mục**: `synop_189_starion/` (và các file nén `.tar.gz`)
*   **Định dạng**: `.txt` cố định độ rộng cột (fixed-width), phân loại theo từng năm/tháng/ngày/giờ (vd: `2026/202601/20260101/2026010100.txt`).
*   **Nội dung đo đạc**: Dữ liệu trải dài nhiều năm (ví dụ năm 2026 có khoảng 1000+ file dữ liệu).
*   **Các biến (Trường thông tin)**:
    *   `Obs`: Mã thời gian (VD: 2026010107)
    *   `TenTram`, `MaTram`: Thông tin định danh trạm (VD: Điện Biên Phủ, Bạch Long Vĩ).
    *   `Vido`, `Kinhdo`: Tọa độ trạm (Point).
    *   `Mua06h`, `Mua24h`: Lượng mưa trong 6h và 24h.
    *   `T2m`, `Tmin`, `Tmax`: Nhiệt độ bề mặt, tối thiểu, tối đa.
    *   `DoAm`, `Ps`: Độ ẩm (%) và Áp suất bề mặt.
    *   `HuongGio`, `TocDo`: Hướng gió và tốc độ gió.

### 2.2. Quan trắc Khí tượng Thủy văn (KTTV)
*   **Thư mục**: `kttv_station_observation/`
*   **Nội dung**: Các số liệu tổng hợp đo đạc lịch sử từ mạng lưới trạm KTTV (có các thư mục dữ liệu dài hạn từ 1998 - 2025).

---

## 3. Dữ liệu Vệ tinh (Satellite Data)

*   **Thư mục**: `AscatData-20260706T082838Z-3-001/`
*   **Định dạng**: Dữ liệu nhị phân/Text (`.dat`, `.dat.gz`).
*   **Đặc điểm**: Dữ liệu vector gió từ vệ tinh ASCAT (Advanced Scatterometer). Có kèm theo mã nguồn Python (`Code python.zip`) do nhà cung cấp hoặc bên thứ 3 viết sẵn để giải mã định dạng `.dat` này.

---

## 4. Dữ liệu Chuyên đề (Thematic Data)

*   **Thư mục**: `dữ liệu không khí lạnh-bão/`
*   **Đặc điểm**: Lưu trữ hồ sơ, số liệu theo dõi chuyên biệt về các đợt không khí lạnh và các cơn bão (Typhoon trajectories, cold surges).

---

## Tổng kết đánh giá về chất lượng dữ liệu:
*   **Sự đa dạng**: Dữ liệu vô cùng phong phú, bao phủ cả mảng dự báo/mô hình (WRF, ERA5) lẫn quan trắc thực tế (KTTV, Synop, Vệ tinh).
*   **Mức độ chuẩn hóa**: Dữ liệu NetCDF đa số đã tuân thủ chuẩn CF (Climate and Forecast conventions), rất thuận lợi để đưa vào GeoServer. Dữ liệu trạm cần được parse qua ETL Script (như đã thiết kế) để loại bỏ các ký tự nhiễu (`xxxx`) và định dạng lại cấu trúc trước khi đưa vào Database.
