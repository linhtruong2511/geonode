// import React, { useState, useMemo } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import StationsPage from "./pages/StationsPage";
import StationDetailPage from "./pages/StationDetailPage";
import { SharedLayout, type NavLinkDef } from "@common/components/SharedLayout";
// import { useMapStore } from "@common/stores/useMapStore";
// import { useMapEvents } from "react-leaflet";

// New Map Components
import { WMSGridLayer } from "./components/map/WMSGridLayer";
import { StormTrackLayer } from "./components/map/StormTrackLayer";
import { SplitMapControl } from "./components/map/SplitMapControl";
import { StationClusterLayer } from "./components/map/StationClusterLayer";

// New Controls & Overlays
import { TimeSliderControl } from "./components/controls/TimeSliderControl";
import { QuerySidebar } from "./components/controls/QuerySidebar";
import { EventSelector } from "./components/controls/EventSelector";
// import { LayerControlPanel } from "./components/controls/LayerControlPanel";

// New Display & Charts
// import { PointGridChart } from "./components/display/PointGridChart";
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
      <TimeSliderControl />
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
        mapLegend={<WindMapLegend />}
        mapMarkers={<WindMapMarkersWrapper />}
        isFullWidthPage={(path) => path === '/data' || (path.startsWith('/stations/') && path !== '/stations')}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/stations/:id" element={<StationDetailPage />} />
          <Route path="/events" element={<div className="co2-card"><div className="co2-card-header">Events</div></div>} />
          <Route path="/data" element={<DataQueryPage />} />
        </Routes>
      </SharedLayout>
    </HashRouter>
  );
};

export default WindManagementApp;
