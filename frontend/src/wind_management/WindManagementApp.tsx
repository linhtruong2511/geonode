import React, { useState, useMemo } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import StationsPage from "./pages/StationsPage";
import StationDetailPage from "./pages/StationDetailPage";
import GridDataPage from "./pages/GridDataPage";
import { SharedLayout, type NavLinkDef } from "@common/components/SharedLayout";
import { useMapStore } from "@common/stores/useMapStore";

// New Map Components
import { StormTrackLayer } from "./components/map/StormTrackLayer";
import { SplitMapControl } from "./components/map/SplitMapControl";
import { StationClusterLayer } from "./components/map/StationClusterLayer";
import { WindVelocityLayer } from "./components/map/WindVelocityLayer";
import { useMapEvents } from "react-leaflet";
import { useWindStore } from "./stores/useWindStore";


import { QuerySidebar } from "./components/controls/QuerySidebar";
import { EventSelector } from "./components/controls/EventSelector";
// import { LayerControlPanel } from "./components/controls/LayerControlPanel";

// New Display & Charts
import { PointGridChart } from "./components/display/PointGridChart";
import { QueryResultsTable } from "./components/display/QueryResultsTable";

// A function to get color based on wind speed (m/s)
const getWindColor = (speed: number) => {
  if (speed >= 25) return "#7f0000"; // Hurricane
  if (speed >= 20) return "#d73027"; // Storm
  if (speed >= 15) return "#f46d43"; // Gale
  if (speed >= 10) return "#fdae61"; // Strong breeze
  if (speed >= 5) return "#fee08b"; // Gentle breeze
  return "#d9ef8b"; // Light air
};

// Map Legend for Wind Speed
const WindMapLegend: React.FC = () => {
  const grades = [0, 5, 10, 15, 20, 25];
  const labels = ["< 5", "5 - 10", "10 - 15", "15 - 20", "20 - 25", ">= 25"];

  return (
    <>
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
          minWidth: "150px"
        }}
      >
        <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>Wind Speed (m/s)</h4>
        {grades.map((grade, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
            <i
              style={{
                width: "18px",
                height: "18px",
                backgroundColor: getWindColor(grade),
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
    </>
  );
};

// const GridLayerSync: React.FC = () => {
//   const { toggleGridLayer, activeGridLayers } = useWindStore();

//   useMapEvents({
//     overlayadd: (e) => {
//       if (e.name.startsWith('ERA5 Wind:')) {
//         const layerCode = e.name.split(': ')[1];
//         if (!activeGridLayers.includes(layerCode)) {
//           toggleGridLayer(layerCode);
//         }
//       }
//     },
//     overlayremove: (e) => {
//       if (e.name.startsWith('ERA5 Wind:')) {
//         const layerCode = e.name.split(': ')[1];
//         if (activeGridLayers.includes(layerCode)) {
//           toggleGridLayer(layerCode);
//         }
//       }
//     }
//   });

//   return null;
// };

// const WindMapOverlaysControl: React.FC = () => {
//   const currentTime = useWindStore(state => state.currentTime);
//   const gridOpacity = useWindStore(state => state.gridOpacity);
//   const datasetVariables = useWindStore(state => state.datasetVariables);
  
//   const layers = datasetVariables.length > 0 
//     ? datasetVariables.map(v => v.variable_code)
//     : ['u10m', 'v10m', 'u100m', 'v100m']; // fallback to default ERA5 wind components

//   return (
//     <>
//       {layers.map(layer => (
//         <LayersControl.Overlay name={`ERA5 Wind: ${layer}`} key={layer}>
//           <WMSTileLayer
//             url="/geoserver/wms"
//             layers={`geonode:${layer}`}
//             format="image/png"
//             transparent={true}
//             opacity={gridOpacity}
//             {...(currentTime ? { time: currentTime } : {})}
//           />
//         </LayersControl.Overlay>
//       ))}
//       <GridLayerSync />
//     </>
//   );
// };

const WindMapMarkersWrapper: React.FC = () => {
  const location = useLocation();
  return (
    <>
      <StormTrackLayer />
      <SplitMapControl />
      {location.pathname.startsWith('/stations') && <StationClusterLayer />}
      {location.pathname === '/grid' && <WindVelocityLayer />}
    </>
  );
};

const navLinks: NavLinkDef[] = [
  { to: "/", icon: "fa-dashboard", label: "Dashboard" },
  { to: "/stations", icon: "fa-location-arrow", label: "Stations" },
  { to: "/grid", icon: "fa-th", label: "Gridded Data" },
  { to: "/events", icon: "fa-hurricane", label: "Meteorological Events" },
  { to: "/data", icon: "fa-table", label: "Data Query" },
];

const routeNames: Record<string, string> = {
  "/": "Tổng quan",
  "/stations": "Trạm quan trắc",
  "/grid": "Dữ liệu lưới",
  "/events": "Sự kiện thời tiết",
  "/data": "Truy vấn dữ liệu",
};

const DataQueryPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="co2-card">
        <div className="co2-card-header">Query Controls</div>
        <div className="co2-card-body" style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1 }}><EventSelector /></div>
          <div style={{ flex: 1 }}><QuerySidebar /></div>
        </div>
      </div>
      <div className="co2-card">
        <div className="co2-card-header">Results</div>
        <div className="co2-card-body">
          <QueryResultsTable />
        </div>
      </div>
    </div>
  );
};

const MapTopOverlay: React.FC = () => {
  const location = useLocation();
  const mapData = useMapStore((state) => state.mapData);
  const currentGridData = useWindStore((state) => state.currentGridData);
  const [mousePos, setMousePos] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    mousemove: (e) => {
      setMousePos(e.latlng);
    },
  });

  // 1. Station statistics
  const stationStats = useMemo(() => {
    if (!location.pathname.startsWith("/stations") || !mapData || mapData.length === 0) return null;
    
    let max = -Infinity;
    let min = Infinity;
    
    mapData.forEach((item) => {
      const s = item.wind_speed;
      if (typeof s === "number") {
        if (s < min) min = s;
        if (s > max) max = s;
      }
    });

    return {
      total: mapData.length,
      max: max === -Infinity ? 0 : max,
      min: min === Infinity ? 0 : min,
    };
  }, [mapData, location.pathname]);

  // 2. Gridded Data mouse hover lookup
  const hoveredGridValue = useMemo(() => {
    if (location.pathname !== "/grid" || !currentGridData || !mousePos) return null;

    const { lats, lons, u, v } = currentGridData;
    if (!lats || !lons || !u || lats.length === 0 || lons.length === 0) return null;

    // Find closest latitude index
    let closestR = 0;
    let minLatDiff = Infinity;
    for (let r = 0; r < lats.length; r++) {
      const diff = Math.abs(lats[r] - mousePos.lat);
      if (diff < minLatDiff) {
        minLatDiff = diff;
        closestR = r;
      }
    }

    // Find closest longitude index
    let closestC = 0;
    let minLonDiff = Infinity;
    for (let c = 0; c < lons.length; c++) {
      const diff = Math.abs(lons[c] - mousePos.lng);
      if (diff < minLonDiff) {
        minLonDiff = diff;
        closestC = c;
      }
    }

    // Lookup corresponding values
    const uVal = u[closestR]?.[closestC];
    const vVal = v?.[closestR]?.[closestC] || 0;

    if (uVal === undefined || uVal === null) return null;

    const speed = Math.sqrt(uVal * uVal + vVal * vVal);
    // Meteorological wind direction (direction from which the wind blows)
    const directionDeg = Math.round((Math.atan2(-uVal, -vVal) * 180 / Math.PI + 360) % 360);

    return {
      speed,
      directionDeg,
      lat: lats[closestR],
      lon: lons[closestC]
    };
  }, [currentGridData, mousePos, location.pathname]);

  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        padding: "8px 18px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        display: "flex",
        gap: "16px",
        alignItems: "center",
        border: "1px solid #cbd5e1",
        backdropFilter: "blur(4px)",
        whiteSpace: "nowrap",
        fontSize: "13px",
        color: "#1e293b"
      }}
    >
      {/* Stations Route Info */}
      {location.pathname.startsWith("/stations") && (
        <>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Trạm quan trắc:</span>
            <span className="badge" style={{ backgroundColor: "#3b82f6", color: "white", padding: "3px 8px", borderRadius: "12px", fontWeight: 700 }}>
              {stationStats ? stationStats.total : 0} trạm
            </span>
          </div>
          {stationStats && stationStats.total > 0 && (
            <>
              <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }}></div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#64748b" }}>Gió mạnh nhất:</span>
                <strong style={{ color: "#ef4444" }}>{stationStats.max.toFixed(1)} m/s</strong>
              </div>
              <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }}></div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#64748b" }}>Gió nhẹ nhất:</span>
                <strong style={{ color: "#10b981" }}>{stationStats.min.toFixed(1)} m/s</strong>
              </div>
            </>
          )}
        </>
      )}

      {/* Gridded Data Route Info */}
      {location.pathname === "/grid" && (
        <>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: "#475569" }}>Dữ liệu lưới (ERA5/WRF):</span>
            {hoveredGridValue ? (
              <>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ color: "#64748b" }}>Tốc độ gió:</span>
                  <strong style={{ color: "#3b82f6" }}>{hoveredGridValue.speed.toFixed(2)} m/s</strong>
                </div>
                <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }}></div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ color: "#64748b" }}>Hướng gió:</span>
                  <strong style={{ color: "#f59e0b" }}>{hoveredGridValue.directionDeg}°</strong>
                </div>
                <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }}></div>
                <div style={{ display: "flex", gap: "6px", fontSize: "11px", color: "#64748b" }}>
                  ({hoveredGridValue.lat.toFixed(3)}°, {hoveredGridValue.lon.toFixed(3)}°)
                </div>
              </>
            ) : (
              <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Di chuột lên vùng lưới để xem thông số</span>
            )}
          </div>
        </>
      )}

      {/* General Mouse Location crosshair */}
      <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }}></div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <i className="fa fa-crosshairs" style={{ color: "#64748b", fontSize: "12px" }}></i>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#475569", minWidth: "110px" }}>
          {mousePos ? `${mousePos.lat.toFixed(4)}°, ${mousePos.lng.toFixed(4)}°` : "Đang di chuyển..."}
        </div>
      </div>
    </div>
  );
};

const WindManagementApp: React.FC = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

const AppContent: React.FC = () => {
  const location = useLocation();
  return (
    <>
      <SharedLayout
        appName="Wind Analytics"
        appIcon={<i className="fa fa-wind fa-2x" style={{ color: "#397aab" }}></i>}
        navLinks={navLinks}
        routeNames={routeNames}
        mapLegend={<WindMapLegend />}
        mapMarkers={<WindMapMarkersWrapper />}
        mapOverlay={<MapTopOverlay />}
        isFullWidthPage={(path) => path === '/data' || (path.startsWith('/stations/') && path !== '/stations')}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/stations/:id" element={<StationDetailPage />} />
          <Route path="/grid" element={<GridDataPage />} />
          <Route path="/events" element={<div className="co2-card"><div className="co2-card-header">Events</div></div>} />
          <Route path="/data" element={<DataQueryPage />} />
        </Routes>
      </SharedLayout>
      {location.pathname === '/grid' && <PointGridChart />}
    </>
  );
};

export default WindManagementApp;
