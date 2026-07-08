# Triển khai Nhóm A1 & A2 (Trực quan hóa dữ liệu Gió & Trạm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai bảng điều khiển bản đồ, hiển thị các lớp dữ liệu lưới (WMSGridLayer) và trạm quan trắc (StationClusterLayer) hoạt động reactive theo lựa chọn người dùng.

**Architecture:** Sử dụng Zustand `useWindStore` quản lý trạng thái hiển thị của lớp lưới và lớp trạm. Tạo component `LayerControlPanel` nổi trên bản đồ để thay đổi trạng thái này. `WMSGridLayer` và `StationClusterLayer` sẽ phản hồi trực tiếp với các thay đổi state.

**Tech Stack:** React 19, TypeScript, Zustand 5, Bootstrap 3 (CSS), React-Leaflet 5, Django REST API.

## Global Constraints
- Sử dụng Bootstrap 3 cho các style và lớp giao diện.
- Mọi thay đổi code frontend cần chạy `npm run build` trong thư mục `frontend/` để kiểm tra lỗi biên dịch TypeScript/Vite.
- Đồng bộ static file thông qua `python manage.py collectstatic --noinput` sau mỗi lần build thành công.

---

### Task 1: Mở rộng Store `useWindStore`

**Files:**
- Modify: `frontend/src/wind_management/stores/useWindStore.ts`

**Interfaces:**
- Consumes: Nothing
- Produces:
  - State: `showStations` (boolean), `gridOpacity` (number)
  - Actions: `setShowStations(show: boolean)`, `setGridOpacity(opacity: number)`

- [ ] **Step 1: Định nghĩa kiểu dữ liệu mới**
  Thêm `showStations`, `gridOpacity` và các action setter vào interface `WindState` trong `frontend/src/wind_management/stores/useWindStore.ts`.
- [ ] **Step 2: Khởi tạo giá trị mặc định**
  Gán giá trị khởi tạo `showStations: true`, `gridOpacity: 0.8`.
- [ ] **Step 3: Triển khai các action setter**
  Cập nhật hàm khởi tạo store `create<WindState>` để có đủ các hàm:
  ```typescript
  setShowStations: (show) => set({ showStations: show }),
  setGridOpacity: (opacity) => set({ gridOpacity: opacity }),
  ```
- [ ] **Step 4: Kiểm tra build**
  Chạy lệnh build kiểm tra lỗi type check:
  Run: `npm run build` (ở thư mục `frontend/`)
  Expected: Báo compile thành công.

---

### Task 2: Tạo Component `LayerControlPanel`

**Files:**
- Create: `frontend/src/wind_management/components/controls/LayerControlPanel.tsx`

**Interfaces:**
- Consumes: `useWindStore`
- Produces: Giao diện Panel điều khiển chọn Layer lưới và Bật/tắt Trạm bằng Bootstrap 3.

- [ ] **Step 1: Tạo file và dựng UI base**
  Tạo file `frontend/src/wind_management/components/controls/LayerControlPanel.tsx` với cấu trúc Bootstrap 3 Panel.
  ```tsx
  import React, { useEffect, useState } from 'react';
  import axios from 'axios';
  import { useWindStore } from '../../stores/useWindStore';

  export const LayerControlPanel: React.FC = () => {
    const { 
      activeGridLayers, toggleGridLayer, 
      showStations, setShowStations,
      gridOpacity, setGridOpacity 
    } = useWindStore();
    const [datasets, setDatasets] = useState<any[]>([]);

    useEffect(() => {
      axios.get('/wind/api/v1/datasets/?category=GRIDDED')
        .then(res => setDatasets(res.data.results || res.data))
        .catch(err => console.error("Failed to fetch datasets", err));
    }, []);

    return (
      <div className="panel panel-default" style={{
        position: 'absolute', top: '70px', right: '20px', zIndex: 1000,
        width: '240px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <div className="panel-heading" style={{ fontWeight: 'bold' }}>Điều khiển Lớp bản đồ</div>
        <div className="panel-body" style={{ padding: '10px' }}>
          {/* Lớp trạm */}
          <div className="checkbox">
            <label style={{ fontWeight: 'bold' }}>
              <input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} />
              Trạm quan trắc (A2)
            </label>
          </div>
          <hr style={{ margin: '10px 0' }} />
          {/* Lớp lưới */}
          <label style={{ fontWeight: 'bold' }}>Dữ liệu lưới (A1)</label>
          <div className="radio">
            <label>
              <input type="radio" name="gridDataset" checked={activeGridLayers.length === 0} onChange={() => {
                // Clear active grid layers
                activeGridLayers.forEach(l => toggleGridLayer(l));
              }} />
              <em>Không hiển thị</em>
            </label>
          </div>
          {datasets.map(ds => (
            <div className="radio" key={ds.id}>
              <label>
                <input type="radio" name="gridDataset" 
                  checked={activeGridLayers.includes(ds.code)} 
                  onChange={() => {
                    // Tắt hết layer cũ và bật layer mới
                    activeGridLayers.forEach(l => toggleGridLayer(l));
                    toggleGridLayer(ds.code);
                  }} 
                />
                {ds.name}
              </label>
            </div>
          ))}
          {activeGridLayers.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '11px' }}>Độ trong suốt: {Math.round(gridOpacity * 100)}%</label>
              <input type="range" min="0.1" max="1" step="0.1" value={gridOpacity} onChange={(e) => setGridOpacity(parseFloat(e.target.value))} />
            </div>
          )}
        </div>
      </div>
    );
  };
  ```
- [ ] **Step 2: Build kiểm tra**
  Run: `npm run build`
  Expected: Thành công.

---

### Task 3: Tích hợp `LayerControlPanel` vào bản đồ

**Files:**
- Modify: `frontend/src/wind_management/WindManagementApp.tsx`

**Interfaces:**
- Consumes: `LayerControlPanel`

- [ ] **Step 1: Import và render Component**
  Import `LayerControlPanel` vào `WindManagementApp.tsx` và đặt nó bên trong `WindMapOverlay` kế bên widget hiển thị tọa độ.
- [ ] **Step 2: Biên dịch code**
  Run: `npm run build`
  Expected: Pass.

---

### Task 4: Triển khai logic phản hồi trong các Layer bản đồ

**Files:**
- Modify: `frontend/src/wind_management/components/map/WMSGridLayer.tsx`
- Modify: `frontend/src/wind_management/components/map/StationClusterLayer.tsx`

**Interfaces:**
- Consumes: `useWindStore` (`activeGridLayers`, `gridOpacity`, `showStations`), `/wind/api/v1/stations/` API.
- Produces: Rendering các trạm quan trắc (Cluster) và dữ liệu lưới WMS tương tác thực tế.

- [ ] **Step 1: Cập nhật `WMSGridLayer.tsx`**
  Đọc `gridOpacity` từ store và truyền vào component `<WMSTileLayer opacity={gridOpacity} />`.
- [ ] **Step 2: Cập nhật `StationClusterLayer.tsx`**
  Lắng nghe `showStations` và gọi API `/wind/api/v1/stations/` để lấy dữ liệu trạm khi `showStations` là `true`.
  Đồng thời lưu danh sách trạm vào `mapData` của `useMapStore`.
  Nếu `showStations` là `false`, không render gì cả.
  ```tsx
  import React, { useEffect, useState } from 'react';
  import { CircleMarker, Popup } from 'react-leaflet';
  import { useMapStore } from '@common/stores/useMapStore';
  import { useWindStore } from '../../stores/useWindStore';
  import axios from 'axios';

  export const StationClusterLayer: React.FC = () => {
    const setMapData = useMapStore((state) => state.setMapData);
    const mapData = useMapStore((state) => state.mapData);
    const focusedId = useMapStore((state) => state.focusedId);
    const { selectedVariables, showStations } = useWindStore();
    const activeVar = selectedVariables.length > 0 ? selectedVariables[0] : 'wind_speed';

    useEffect(() => {
      if (showStations) {
        axios.get('/wind/api/v1/stations/')
          .then(res => {
            // serializer trả về GeoJSON dạng FeatureCollection
            const features = res.data.features || [];
            const parsedStations = features.map((f: any) => ({
              id: f.id,
              name: f.properties.name,
              station_code: f.properties.station_code,
              elevation: f.properties.elevation,
              station_type: f.properties.station_type,
              // GeoJSON geometry coords: [lng, lat]
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
              wind_speed: 12, // mock value vì endpoint list trạm không kèm obs_speed realtime
              wind_dir: 180
            }));
            setMapData(parsedStations);
          })
          .catch(err => console.error("Error fetching stations", err));
      } else {
        setMapData([]);
      }
    }, [showStations, setMapData]);

    if (!showStations) return null;

    return (
      <>
        {mapData.map((item: any) => (
          <CircleMarker
            key={item.id}
            center={[item.lat, item.lon]}
            radius={focusedId === item.id ? 10 : 6}
            pathOptions={{
              fillColor: '#fdae61',
              color: focusedId === item.id ? '#ef4444' : '#fff',
              weight: focusedId === item.id ? 3 : 1,
              opacity: 1,
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div><strong>Trạm:</strong> {item.name}</div>
            </Popup>
          </CircleMarker>
        ))}
      </>
    );
  };
  ```
- [ ] **Step 3: Biên dịch toàn bộ ứng dụng**
  Run: `npm run build`
  Expected: Biên dịch hoàn toàn thành công, không có lỗi TypeScript hay Vite.
