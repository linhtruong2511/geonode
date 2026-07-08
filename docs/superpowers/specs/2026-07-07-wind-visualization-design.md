# Thiết kế kỹ thuật: Nhóm A1 & A2 - Trực quan hóa dữ liệu khí tượng (Gió, Trạm)

Tài liệu này đặc tả chi tiết thiết kế kỹ thuật cho việc triển khai chức năng hiển thị dữ liệu lưới (A1) và trạm quan trắc (A2) trên bản đồ thuộc module `wind_management`.

## 1. Giao diện và Luồng xử lý (UI/UX & Flow)

### 1.1 Bảng điều khiển lớp bản đồ (`LayerControlPanel.tsx`)
- **Vị trí:** Float overlay ở góc trên bên phải bản đồ (bên cạnh/dưới widget hiển thị tọa độ).
- **Mục tiêu:**
  - Lấy danh sách các grid dataset từ API `/wind/api/v1/datasets/?category=GRIDDED`.
  - Hiển thị danh sách này dưới dạng Radio buttons để người dùng chọn xem 1 lớp lưới duy nhất tại 1 thời điểm.
  - Cho phép điều chỉnh độ trong suốt (Opacity) của lớp WMS thông qua thanh trượt (slider) từ `0%` đến `100%`.
  - Cung cấp một Checkbox để Bật/Tắt hiển thị lớp Trạm quan trắc (A2).
- **Style:** Sử dụng style Bootstrap 3 (`panel`, `panel-default`, `list-group`, `form-group`) để tương thích giao diện chung.

### 1.2 Hiển thị dữ liệu lưới WMS (`WMSGridLayer.tsx`)
- **Mục tiêu:** Nhận thông tin Dataset đang kích hoạt từ store, render lớp bản đồ WMS tương ứng sử dụng `<WMSTileLayer>` của React-Leaflet.
- **Nguồn WMS:** `/geoserver/wms` (hoặc cấu hình thông qua biến môi trường/URL hệ thống). Tên layer tương ứng với `geonode:${dataset.code}`.

### 1.3 Hiển thị trạm quan trắc (`StationClusterLayer.tsx`)
- **Mục tiêu:**
  - Lấy dữ liệu từ `/wind/api/v1/stations/` (định dạng GeoJSON) khi trạng thái `showStations` được kích hoạt.
  - Lưu trữ dữ liệu vào `useMapStore` (`mapData`) để đồng bộ với các phần thống kê khác trong ứng dụng.
  - Vẽ các trạm lên bản đồ dưới dạng điểm (`CircleMarker`).
  - Cho phép click vào trạm để mở popup chi tiết (tên trạm, giá trị đo đạc mới nhất).

---

## 2. Quản lý Trạng thái (State Management)

Chúng ta sẽ sử dụng store `useWindStore` đã có sẵn tại `frontend/src/wind_management/stores/useWindStore.ts` để lưu trữ các biến điều khiển:

```typescript
// Cập nhật/Mở rộng useWindStore.ts:
activeGridLayers: string[]; // Chứa code của dataset lưới đang chọn (1 phần tử)
showStations: boolean; // Trạng thái ẩn/hiện trạm (thêm mới)
gridOpacity: number; // Độ trong suốt của lớp lưới, từ 0 đến 1 (thêm mới)
```

---

## 3. Bản vẽ thiết kế các File chỉnh sửa

### 3.1 `frontend/src/wind_management/stores/useWindStore.ts`
- Thêm biến `showStations` (mặc định `true`).
- Thêm biến `gridOpacity` (mặc định `0.8`).
- Thêm action `setShowStations` và `setGridOpacity`.
- Điều chỉnh `toggleGridLayer` hoặc tạo `setActiveGridLayer` để phục vụ chọn Radio button cho lớp lưới.

### 3.2 `frontend/src/wind_management/components/controls/LayerControlPanel.tsx`
- Tạo mới file này để hiển thị panel điều khiển bật tắt.

### 3.3 `frontend/src/wind_management/components/map/WMSGridLayer.tsx`
- Đọc `gridOpacity` và `activeGridLayers` để render `<WMSTileLayer>`.

### 3.4 `frontend/src/wind_management/components/map/StationClusterLayer.tsx`
- Fetch dữ liệu từ `/api/wind/stations/` khi component mount và `showStations` là `true`.
- Cập nhật danh sách trạm vào `mapData` của `useMapStore`.
- Vẽ các trạm tương ứng.
