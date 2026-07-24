import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import "./styles/co2_base.css";

import SatelliteList from "./pages/SatelliteList";
import SourceList from "./pages/SourceList";
import JobList from "./pages/JobList";
import LocationList from "./pages/LocationList";
import LocationForm from "./pages/LocationForm";
import MeasurementList from "./pages/MeasurementList";
import StationList from "./pages/StationList";
import StationDetailPage from "./pages/StationDetailPage";
import Comparisons from "./pages/Comparisons";
import Statistics from "./pages/Statistics";

import { useMapStore } from "@common/stores/useMapStore";
import { CircleMarker, Popup, useMapEvents } from "react-leaflet";
import { SharedLayout, type NavLinkDef } from "@common/components/SharedLayout";

const getColor = (xco2: number) => {
  if (xco2 >= 430) return "#7f0000";
  if (xco2 >= 425) return "#d73027";
  if (xco2 >= 420) return "#f46d43";
  if (xco2 >= 415) return "#fdae61";
  if (xco2 >= 410) return "#fee08b";
  return "#d9ef8b";
};

// Component hiển thị thông số thống kê và tọa độ chuột
const MapTopOverlay: React.FC = () => {
  const mapData = useMapStore((state) => state.mapData);
  const [mousePos, setMousePos] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    mousemove: (e) => {
      setMousePos(e.latlng);
    },
  });

  const stats = useMemo(() => {
    if (!mapData || mapData.length === 0) return null;
    
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    
    mapData.forEach(item => {
      if (typeof item.xco2_ppm === 'number') {
        if (item.xco2_ppm < min) min = item.xco2_ppm;
        if (item.xco2_ppm > max) max = item.xco2_ppm;
        sum += item.xco2_ppm;
        count++;
      }
    });
    
    return {
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
      avg: count > 0 ? sum / count : 0,
      total: mapData.length
    };
  }, [mapData]);

  return (
    <div
      style={{
        position: "absolute",
        top: "5px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        padding: "6px 16px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        display: "flex",
        gap: "16px",
        alignItems: "center",
        border: "1px solid var(--color-border)",
        backdropFilter: "blur(4px)",
        whiteSpace: "nowrap"
      }}
    >
      {stats && (
        <>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Tổng điểm</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{stats.total}</div>
          </div>
          <div style={{ width: '1px', height: '24px', backgroundColor: '#eee' }}></div>
          <div>
            <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>TB XCO2</div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{stats.avg.toFixed(2)} <span style={{ fontSize: '10px', fontWeight: 400 }}>ppm</span></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>Min:</span>
              <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '4px' }}>{stats.min.toFixed(1)}</span>
            </div>
            <div style={{ backgroundColor: '#fff1f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fecdd3' }}>
              <span style={{ fontSize: '9px', color: '#e11d48', fontWeight: 600 }}>Max:</span>
              <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '4px' }}>{stats.max.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ width: '1px', height: '24px', backgroundColor: '#eee' }}></div>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <i className="fa fa-crosshairs" style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}></i>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#333', minWidth: '110px' }}>
          {mousePos ? `${mousePos.lat.toFixed(4)}, ${mousePos.lng.toFixed(4)}` : 'Đang tải...'}
        </div>
      </div>
    </div>
  );
};

// Component vẽ Marker thông minh hỗ trợ Highlight và Tự động mở Popup chi tiết
const MeasurementMarker: React.FC<{ item: any; focusedId: number | null }> = ({ item, focusedId }) => {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (markerRef.current && focusedId === item.id) {
      // Tự động mở popup chi tiết khi điểm này được định vị
      setTimeout(() => {
        markerRef.current?.openPopup();
      }, 100);
    }
  }, [focusedId, item.id]);

  const isFocused = focusedId === item.id;
  const isStation = Boolean(item.name || item.code);

  const markerColor = isStation
    ? (item.status === 0 ? '#10b981' : '#f59e0b')
    : getColor(item.xco2_ppm);

  return (
    <CircleMarker
      ref={markerRef}
      center={[item.latitude, item.longitude]}
      radius={isFocused ? 10 : (isStation ? 7 : 5)}
      pathOptions={{
        fillColor: markerColor,
        color: isFocused ? '#ef4444' : markerColor,
        weight: isFocused ? 3 : 1,
        opacity: isFocused ? 1.0 : 0.8,
        fillOpacity: isFocused ? 0.95 : 0.7,
      }}
    >
      <Popup autoPan={false}>
        {isStation ? (
          <div style={{ fontSize: "11px", minWidth: "170px" }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '4px', fontWeight: 700 }}>
              <a
                href={`#/stations/${item.id}`}
                style={{ color: 'var(--color-accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                title="Xem trang chi tiết trạm quan trắc"
              >
                <span>Trạm: {item.name}</span>
                <i className="fa fa-external-link" style={{ fontSize: '11px', marginLeft: '6px' }}></i>
              </a>
            </div>
            <strong>Mã trạm:</strong> {item.code || 'N/A'}<br />
            <strong>Trạng thái:</strong> {item.status === 0 ? 'Bình thường' : 'Bảo trì'}<br />
            <strong>Địa chỉ:</strong> {item.address || 'N/A'}<br />
            <strong>Số bản ghi:</strong> {item.measurement_count || 0}<br />
            <strong>Tọa độ:</strong> {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}<br />
            <a
              href={`#/stations/${item.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '6px',
                padding: '3px 8px',
                backgroundColor: 'var(--color-accent-primary)',
                color: '#fff',
                borderRadius: '4px',
                textDecoration: 'none',
                fontSize: '10px',
                fontWeight: 600
              }}
            >
              <i className="fa fa-line-chart"></i> Xem chi tiết trạm
            </a>
          </div>
        ) : (
          <div style={{ fontSize: "11px", minWidth: "140px" }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '3px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
              Điểm đo #{item.id}
            </div>
            <strong>XCO2:</strong> {item.xco2_ppm?.toFixed(2)} ppm<br />
            <strong>Thời gian:</strong> {new Date(item.measurement_time).toLocaleString("vi-VN")}<br />
            <strong>Tọa độ:</strong> {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}<br />
            <strong>Nguồn:</strong> {item.data_source}
          </div>
        )}
      </Popup>
    </CircleMarker>
  );
};

const MapLegend: React.FC = () => {
  const { 
    isSpatialSearchEnabled,
    setIsSpatialSearchEnabled, 
    isDrawingMode, setIsDrawingMode,
    drawnGeometry, setDrawnGeometry
  } = useMapStore();
  
  const grades = [0, 410, 415, 420, 425, 430];
  const labels = ["< 410", "410 - 415", "415 - 420", "420 - 425", "425 - 430", ">= 430"];

  const toggleDrawingMode = () => {
    const newMode = !isDrawingMode;
    setIsDrawingMode(newMode);
    if (newMode) {
      setIsSpatialSearchEnabled(true);
    }
  };

  const clearDrawing = () => {
    setDrawnGeometry(null);
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "20px",
        left: "20px",
        zIndex: 1000,
        backgroundColor: "white",
        padding: "12px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        fontSize: "12px",
        lineHeight: "1.5",
        minWidth: "180px"
      }}
    >
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          <input 
            type="checkbox" 
            checked={isSpatialSearchEnabled && !isDrawingMode} 
            onChange={(e) => {
              setIsSpatialSearchEnabled(e.target.checked);
              if (e.target.checked) setIsDrawingMode(false);
            }}
            style={{ marginRight: '8px' }}
          />
          Tìm theo khung nhìn
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>
          <input 
            type="checkbox" 
            checked={isDrawingMode} 
            onChange={toggleDrawingMode}
            style={{ marginRight: '8px' }}
          />
          Tìm theo vùng vẽ
        </label>
        
        {drawnGeometry && (
          <button 
            onClick={clearDrawing}
            style={{ 
              marginTop: '8px', width: '100%', padding: '4px', 
              fontSize: '10px', backgroundColor: '#fee2e2', 
              color: '#991b1b', border: '1px solid #fecaca', 
              borderRadius: '4px', cursor: 'pointer' 
            }}
          >
            Xóa vùng đã vẽ
          </button>
        )}
      </div>
      <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>XCO2 (ppm)</h4>
      {grades.map((grade, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
          <i
            style={{
              width: "18px",
              height: "18px",
              backgroundColor: getColor(grade),
              marginRight: "8px",
              opacity: 0.8,
              borderRadius: "50%",
              display: "inline-block",
            }}
          ></i>
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

const CO2MapMarkers: React.FC = () => {
  const mapData = useMapStore((state) => state.mapData);
  const focusedId = useMapStore((state) => state.focusedId);

  return (
    <>
      {mapData.map((item) =>
        item.latitude && item.longitude ? (
          <MeasurementMarker key={item.id} item={item} focusedId={focusedId} />
        ) : null
      )}
    </>
  );
};

const navLinks: NavLinkDef[] = [
  { to: "/", icon: "fa-dashboard", label: "Bảng điều khiển" },
  { to: "/satellites", icon: "fa-rocket", label: "Vệ tinh" },
  { to: "/sources", icon: "fa-database", label: "Nguồn dữ liệu" },
  { to: "/stations", icon: "fa-building", label: "Trạm quan trắc" },
  { to: "/measurements", icon: "fa-flask", label: "Dữ liệu đo lường" },
  { to: "/statistics", icon: "fa-bar-chart", label: "Thống kê XCO2" },
];

const routeNames: Record<string, string> = {
  "/": "Tổng quan",
  "/satellites": "Vệ tinh",
  "/sources": "Nguồn dữ liệu",
  "/stations": "Trạm quan trắc",
  "/stations/:id": "Chi tiết trạm",
  "/measurements": "Dữ liệu đo lường",
  "/locations/new": "Thêm vị trí",
  "/comparisons": "So sánh dữ liệu",
  "/jobs": "Phiên phân tích",
  "/statistics": "Thống kê XCO2",
};

const DynamicMapLegend: React.FC = () => {
  const customLegend = useMapStore((state) => state.customLegend);

  if (customLegend === null) {
    return null;
  }

  if (customLegend !== undefined) {
    return <>{customLegend}</>;
  }

  return <MapLegend />;
};

const CO2ManagementApp: React.FC = () => {
  return (
    <HashRouter>
      <SharedLayout
        appName="CO2 Management"
        navLinks={navLinks}
        routeNames={routeNames}
        mapOverlay={<MapTopOverlay />}
        mapLegend={<DynamicMapLegend />}
        mapMarkers={<CO2MapMarkers />}
        isFullWidthPage={(path) => path === "/statistics" || path.startsWith("/stations/")}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/satellites" element={<SatelliteList />} />
          <Route path="/sources" element={<SourceList />} />
          <Route path="/stations" element={<StationList />} />
          <Route path="/stations/:id" element={<StationDetailPage />} />
          <Route path="/measurements" element={<MeasurementList />} />
          <Route path="/locations" element={<LocationList />} />
          <Route path="/locations/new" element={<LocationForm />} />
          <Route path="/locations/:id/edit" element={<LocationForm />} />
          <Route path="/comparisons" element={<Comparisons />} />
          <Route path="/jobs" element={<JobList />} />
          <Route path="/statistics" element={<Statistics />} />
        </Routes>
      </SharedLayout>
    </HashRouter>
  );
};

export default CO2ManagementApp;
