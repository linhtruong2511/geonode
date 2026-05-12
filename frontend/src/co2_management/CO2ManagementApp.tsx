import React, { useState, useEffect, useRef, useMemo } from "react";
import { HashRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import "./styles/co2_base.css";

import SatelliteList from "./pages/SatelliteList";
import SourceList from "./pages/SourceList";
import JobList from "./pages/JobList";
import LocationList from "./pages/LocationList";
import LocationForm from "./pages/LocationForm";
import MeasurementList from "./pages/MeasurementList";
import Comparisons from "./pages/Comparisons";
import Statistics from "./pages/Statistics";
import { useMapStore } from ".././common/stores/useMapStore";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, useMap, LayersControl } from "react-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet/dist/leaflet.css";

const getColor = (xco2: number) => {
  if (xco2 >= 430) return "#7f0000";
  if (xco2 >= 425) return "#d73027";
  if (xco2 >= 420) return "#f46d43";
  if (xco2 >= 415) return "#fdae61";
  if (xco2 >= 410) return "#fee08b";
  return "#d9ef8b";
};

const GeomanControl: React.FC = () => {
  const map = useMap();
  const { setMapBounds, setDrawnGeometry, isDrawingMode } = useMapStore();

  useEffect(() => {
    if (!isDrawingMode) {
      map.pm.removeControls();
      return;
    }

    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
    });

    map.on("pm:create", (e: any) => {
      const { layer } = e;
      const bounds = layer.getBounds();
      setDrawnGeometry(layer.toGeoJSON());
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
      
      layer.on("pm:edit", (event: any) => {
        const b = event.layer.getBounds();
        setDrawnGeometry(event.layer.toGeoJSON());
        setMapBounds({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        });
      });
    });

    map.on("pm:remove", () => {
      setDrawnGeometry(null);
    });

    return () => {
      map.pm.removeControls();
      map.off("pm:create");
      map.off("pm:remove");
    };
  }, [map, isDrawingMode, setMapBounds, setDrawnGeometry]);

  return null;
};

const MapEvents: React.FC = () => {
  const { setMapBounds, isDrawingMode } = useMapStore();
  const [mousePos, setMousePos] = useState<{ lat: number; lng: number } | null>(null);

  const map = useMapEvents({
    moveend: () => {
      if (isDrawingMode) return;
      const bounds = map.getBounds();
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
    zoomend: () => {
      if (isDrawingMode) return;
      const bounds = map.getBounds();
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
    mousemove: (e) => {
      setMousePos(e.latlng);
    },
  });

  // Initial bounds capture
  useEffect(() => {
    if (!isDrawingMode) {
      const bounds = map.getBounds();
      setMapBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    }
  }, [map, setMapBounds, isDrawingMode]);

  return mousePos ? (
    <div
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        pointerEvents: "none",
        color: "#333",
        fontWeight: 600
      }}
    >
      {mousePos.lat.toFixed(4)}, {mousePos.lng.toFixed(4)}
    </div>
  ) : null;
};

const MapInfoOverlay: React.FC = () => {
  const { mapData } = useMapStore();
  
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

  if (!stats) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        backgroundColor: "white",
        padding: "12px 20px",
        borderRadius: "12px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
        display: "flex",
        gap: "24px",
        alignItems: "center",
        border: "1px solid var(--color-border)",
        backdropFilter: "blur(4px)",
        background: "rgba(255, 255, 255, 0.95)"
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Tổng số điểm</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>{stats.total}</div>
      </div>
      <div style={{ width: '1px', height: '30px', backgroundColor: '#eee' }}></div>
      <div>
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Trung bình XCO2</div>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>{stats.avg.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 400 }}>ppm</span></div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ backgroundColor: '#f8fafc', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Min:</span>
          <span style={{ fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{stats.min.toFixed(1)}</span>
        </div>
        <div style={{ backgroundColor: '#fff1f2', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fecdd3' }}>
          <span style={{ fontSize: '10px', color: '#e11d48', fontWeight: 600 }}>Max:</span>
          <span style={{ fontSize: '12px', fontWeight: 700, marginLeft: '4px' }}>{stats.max.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

const MapLegend: React.FC = () => {
  const { 
    isSpatialSearchEnabled, setIsSpatialSearchEnabled, 
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

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mapData, mapCenter, mapZoom } = useMapStore();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("co2-sidebar-collapsed") === "true";
  });
  const [contentWidth, setContentWidth] = useState(() => {
    const saved = localStorage.getItem("co2-content-width");
    return saved ? parseInt(saved, 10) : 0; // 0 means use flex basis 45%
  });
  const [isDragging, setIsDragging] = useState(false);

  const contentPanelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("co2-sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (contentWidth > 0) {
      localStorage.setItem("co2-content-width", String(contentWidth));
    }
  }, [contentWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current =
      contentPanelRef.current?.getBoundingClientRect().width || 0;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current - dx; // Giảm chiều rộng khi kéo sang phải (vì panel ở bên phải)
      if (newWidth > 300 && newWidth < 1200) {
        setContentWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.dispatchEvent(new Event("resize")); // Cập nhật lại kích thước cho Leaflet
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div id="co2-shell">
      {/* SIDEBAR */}
      <aside id="co2-sidebar" className={isCollapsed ? "collapsed" : ""}>
        <div className="sidebar-toggle-wrap">
          <button
            id="sidebar-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label="Toggle sidebar"
          >
            <i className="fa fa-bars"></i>
          </button>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`sidebar-nav-item ${isActive("/") ? "active" : ""}`}
            data-tooltip="Bảng điều khiển"
          >
            <span className="nav-icon">
              <i className="fa fa-dashboard"></i>
            </span>
            <span className="nav-label">Bảng điều khiển</span>
          </Link>
          <Link
            to="/satellites"
            className={`sidebar-nav-item ${isActive("/satellites") ? "active" : ""}`}
            data-tooltip="Vệ tinh"
          >
            <span className="nav-icon">
              <i className="fa fa-rocket"></i>
            </span>
            <span className="nav-label">Vệ tinh</span>
          </Link>
          <Link
            to="/sources"
            className={`sidebar-nav-item ${isActive("/sources") ? "active" : ""}`}
            data-tooltip="Nguồn dữ liệu"
          >
            <span className="nav-icon">
              <i className="fa fa-database"></i>
            </span>
            <span className="nav-label">Nguồn dữ liệu</span>
          </Link>
          <Link
            to="/measurements"
            className={`sidebar-nav-item ${isActive("/measurements") ? "active" : ""}`}
            data-tooltip="Dữ liệu đo lường"
          >
            <span className="nav-icon">
              <i className="fa fa-flask"></i>
            </span>
            <span className="nav-label">Dữ liệu đo lường</span>
          </Link>
          <Link
            to="/locations"
            className={`sidebar-nav-item ${isActive("/locations") ? "active" : ""}`}
            data-tooltip="Vị trí giám sát"
          >
            <span className="nav-icon">
              <i className="fa fa-map-marker"></i>
            </span>
            <span className="nav-label">Vị trí giám sát</span>
          </Link>
          <Link
            to="/comparisons"
            className={`sidebar-nav-item ${isActive("/comparisons") ? "active" : ""}`}
            data-tooltip="So sánh dữ liệu"
          >
            <span className="nav-icon">
              <i className="fa fa-exchange"></i>
            </span>
            <span className="nav-label">So sánh dữ liệu</span>
          </Link>
          <Link
            to="/jobs"
            className={`sidebar-nav-item ${isActive("/jobs") ? "active" : ""}`}
            data-tooltip="Phiên phân tích"
          >
            <span className="nav-icon">
              <i className="fa fa-cogs"></i>
            </span>
            <span className="nav-label">Phiên phân tích</span>
          </Link>
          <Link
            to="/statistics"
            className={`sidebar-nav-item ${isActive("/statistics") ? "active" : ""}`}
            data-tooltip="Thống kê XCO2"
          >
            <span className="nav-icon">
              <i className="fa fa-bar-chart"></i>
            </span>
            <span className="nav-label">Thống kê XCO2</span>
          </Link>
        </nav>
        <div className="sidebar-footer">CO2 Management v1.0 (React)</div>
      </aside>

      {/* SPLIT CONTAINER */}
      <div id="co2-split-container">
        {/* CENTER MAP PANEL */}
        <div id="co2-map-panel">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: "100%", width: "100%" }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Bản đồ đường phố">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Bản đồ vệ tinh">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
            <MapEvents />
            <GeomanControl />

            {mapData.map((item, index) =>
              item.latitude && item.longitude ? (
                <CircleMarker
                  key={index}
                  center={[item.latitude, item.longitude]}
                  radius={5}
                  pathOptions={{
                    fillColor: getColor(item.xco2_ppm),
                    color: getColor(item.xco2_ppm),
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.6,
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: "12px" }}>
                      <strong>XCO2:</strong> {item.xco2_ppm?.toFixed(2)} ppm<br />
                      <strong>Thời gian:</strong> {new Date(item.measurement_time).toLocaleString("vi-VN")}<br />
                      <strong>Vị trí:</strong> {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}<br />
                      <strong>Nguồn:</strong> {item.data_source}
                    </div>
                  </Popup>
                </CircleMarker>
              ) : null,
            )}
          </MapContainer>
          <MapInfoOverlay />
          <MapLegend />
        </div>

        <div
          id="co2-splitter"
          className={isDragging ? "dragging" : ""}
          onMouseDown={handleMouseDown}
        ></div>

        {/* RIGHT CONTENT PANEL */}
        <div
          id="co2-content-panel"
          ref={contentPanelRef}
          style={contentWidth > 0 ? { flex: `0 0 ${contentWidth}px` } : {}}
        >
          <div id="co2-topbar">
            <div className="topbar-breadcrumb">
              CO2 Management / <span>Tổng quan</span>
            </div>
          </div>

          <div id="co2-content-body">{children}</div>
        </div>
      </div>
    </div>
  );
};

const CO2ManagementApp: React.FC = () => {
  return (
    <HashRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/satellites" element={<SatelliteList />} />
          <Route path="/sources" element={<SourceList />} />
          <Route path="/measurements" element={<MeasurementList />} />
          <Route path="/locations" element={<LocationList />} />
          <Route path="/locations/new" element={<LocationForm />} />
          <Route path="/locations/:id/edit" element={<LocationForm />} />
          <Route path="/comparisons" element={<Comparisons />} />
          <Route path="/jobs" element={<JobList />} />
          <Route path="/statistics" element={<Statistics />} />
        </Routes>
      </MainLayout>
    </HashRouter>
  );
};

export default CO2ManagementApp;
