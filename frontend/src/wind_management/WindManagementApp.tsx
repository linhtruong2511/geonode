import React, { useState, useMemo } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import { SharedLayout, type NavLinkDef } from "@common/components/SharedLayout";
import { useMapStore } from "@common/stores/useMapStore";
import { useMapEvents } from "react-leaflet";

// New Map Components
import { WMSGridLayer } from "./components/map/WMSGridLayer";
import { StormTrackLayer } from "./components/map/StormTrackLayer";
import { SplitMapControl } from "./components/map/SplitMapControl";
import { StationClusterLayer } from "./components/map/StationClusterLayer";

// New Controls & Overlays
import { TimeSliderControl } from "./components/controls/TimeSliderControl";
import { QuerySidebar } from "./components/controls/QuerySidebar";
import { EventSelector } from "./components/controls/EventSelector";
import { LayerControlPanel } from "./components/controls/LayerControlPanel";

// New Display & Charts
import { StationTimeSeriesChart } from "./components/display/StationTimeSeriesChart";
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

// Map Overlay for Wind Stats
const WindMapOverlay: React.FC = () => {
  const mapData = useMapStore((state) => state.mapData);
  const [mousePos, setMousePos] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    mousemove: (e) => {
      setMousePos(e.latlng);
    },
  });

  const stats = useMemo(() => {
    if (!mapData || mapData.length === 0) return null;
    
    let maxSpeed = 0;
    let count = 0;
    
    mapData.forEach(item => {
      if (typeof item.wind_speed === 'number') {
        if (item.wind_speed > maxSpeed) maxSpeed = item.wind_speed;
        count++;
      }
    });
    
    return {
      maxSpeed,
      total: count
    };
  }, [mapData]);

  return (
    <>
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
        {stats && stats.total > 0 && (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Trạm đo</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{stats.total}</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#eee' }}></div>
            <div>
              <div style={{ fontSize: '9px', color: '#e11d48', textTransform: 'uppercase', fontWeight: 700 }}>Max Speed</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{stats.maxSpeed.toFixed(1)} <span style={{ fontSize: '10px', fontWeight: 400 }}>m/s</span></div>
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
      <LayerControlPanel />
      <PointGridChart />
    </>
  );
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
      <TimeSliderControl />
      <StationTimeSeriesChart />
    </>
  );
};

const WindMapMarkersWrapper: React.FC = () => {
  return (
    <>
      <WMSGridLayer />
      <StormTrackLayer />
      <SplitMapControl />
      <StationClusterLayer />
    </>
  );
};

const navLinks: NavLinkDef[] = [
  { to: "/", icon: "fa-dashboard", label: "Dashboard" },
  { to: "/stations", icon: "fa-broadcast-tower", label: "Stations" },
  { to: "/events", icon: "fa-hurricane", label: "Meteorological Events" },
  { to: "/data", icon: "fa-table", label: "Data Query" },
];

const routeNames: Record<string, string> = {
  "/": "Tổng quan",
  "/stations": "Trạm quan trắc",
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

const WindManagementApp: React.FC = () => {
  return (
    <HashRouter>
      <SharedLayout
        appName="Wind Analytics"
        appIcon={<i className="fa fa-wind fa-2x" style={{ color: "#397aab" }}></i>}
        navLinks={navLinks}
        routeNames={routeNames}
        mapOverlay={<WindMapOverlay />}
        mapLegend={<WindMapLegend />}
        mapMarkers={<WindMapMarkersWrapper />}
        isFullWidthPage={(path) => path === '/data'}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stations" element={<div className="co2-card"><div className="co2-card-header">Stations</div></div>} />
          <Route path="/events" element={<div className="co2-card"><div className="co2-card-header">Events</div></div>} />
          <Route path="/data" element={<DataQueryPage />} />
        </Routes>
      </SharedLayout>
    </HashRouter>
  );
};

export default WindManagementApp;
