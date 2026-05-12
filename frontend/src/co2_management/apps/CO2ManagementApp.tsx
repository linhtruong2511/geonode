import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import '../styles/co2_base.css';

import SatelliteList from '../pages/SatelliteList';
import SourceList from '../pages/SourceList';
import JobList from '../pages/JobList';
import LocationList from '../pages/LocationList';
import LocationForm from '../pages/LocationForm';
import MeasurementList from '../pages/MeasurementList';
import Comparisons from '../pages/Comparisons';
import Statistics from '../pages/Statistics';
import { useMapStore } from '../../common/stores/useMapStore';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showMap, mapData, mapCenter, mapZoom } = useMapStore();
  
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('co2-sidebar-collapsed') === 'true';
  });
  const [contentWidth, setContentWidth] = useState(() => {
    const saved = localStorage.getItem('co2-content-width');
    return saved ? parseInt(saved, 10) : 0; // 0 means use flex basis 45%
  });
  const [isDragging, setIsDragging] = useState(false);
  
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('co2-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (contentWidth > 0) {
      localStorage.setItem('co2-content-width', String(contentWidth));
    }
  }, [contentWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = contentPanelRef.current?.getBoundingClientRect().width || 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + dx;
      if (newWidth > 300 && newWidth < 1200) {
        setContentWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize')); // For Leaflet
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div id="co2-shell">
      {/* SIDEBAR */}
      <aside id="co2-sidebar" className={isCollapsed ? 'collapsed' : ''}>
        <div className="sidebar-toggle-wrap">
          <button id="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)} aria-label="Toggle sidebar">
            <i className="fa fa-bars"></i>
          </button>
        </div>
        <nav className="sidebar-nav">
          <Link to="/" className={`sidebar-nav-item ${isActive('/') ? 'active' : ''}`} data-tooltip="Bảng điều khiển">
            <span className="nav-icon"><i className="fa fa-dashboard"></i></span>
            <span className="nav-label">Bảng điều khiển</span>
          </Link>
          <Link to="/satellites" className={`sidebar-nav-item ${isActive('/satellites') ? 'active' : ''}`} data-tooltip="Vệ tinh">
            <span className="nav-icon"><i className="fa fa-rocket"></i></span>
            <span className="nav-label">Vệ tinh</span>
          </Link>
          <Link to="/sources" className={`sidebar-nav-item ${isActive('/sources') ? 'active' : ''}`} data-tooltip="Nguồn dữ liệu">
            <span className="nav-icon"><i className="fa fa-database"></i></span>
            <span className="nav-label">Nguồn dữ liệu</span>
          </Link>
          <Link to="/measurements" className={`sidebar-nav-item ${isActive('/measurements') ? 'active' : ''}`} data-tooltip="Dữ liệu đo lường">
            <span className="nav-icon"><i className="fa fa-flask"></i></span>
            <span className="nav-label">Dữ liệu đo lường</span>
          </Link>
          <Link to="/locations" className={`sidebar-nav-item ${isActive('/locations') ? 'active' : ''}`} data-tooltip="Vị trí giám sát">
            <span className="nav-icon"><i className="fa fa-map-marker"></i></span>
            <span className="nav-label">Vị trí giám sát</span>
          </Link>
          <Link to="/comparisons" className={`sidebar-nav-item ${isActive('/comparisons') ? 'active' : ''}`} data-tooltip="So sánh dữ liệu">
            <span className="nav-icon"><i className="fa fa-exchange"></i></span>
            <span className="nav-label">So sánh dữ liệu</span>
          </Link>
          <Link to="/jobs" className={`sidebar-nav-item ${isActive('/jobs') ? 'active' : ''}`} data-tooltip="Phiên phân tích">
            <span className="nav-icon"><i className="fa fa-cogs"></i></span>
            <span className="nav-label">Phiên phân tích</span>
          </Link>
          <Link to="/statistics" className={`sidebar-nav-item ${isActive('/statistics') ? 'active' : ''}`} data-tooltip="Thống kê XCO2">
            <span className="nav-icon"><i className="fa fa-bar-chart"></i></span>
            <span className="nav-label">Thống kê XCO2</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          CO2 Management v1.0 (React)
        </div>
      </aside>

      {/* SPLIT CONTAINER */}
      <div id="co2-split-container">
        {/* LEFT CONTENT PANEL */}
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
          
          <div id="co2-content-body">
            {children}
          </div>
        </div>

        {/* DRAGGABLE SPLITTER */}
        {showMap && (
          <div 
            id="co2-splitter" 
            className={isDragging ? 'dragging' : ''}
            onMouseDown={handleMouseDown}
          ></div>
        )}

        {/* RIGHT MAP PANEL */}
        {showMap && (
          <div id="co2-map-panel">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapData.map((item, index) => (
                item.latitude && item.longitude ? (
                  <Marker 
                    key={index} 
                    position={[item.latitude, item.longitude]}
                  >
                    {/* Add Popup logic later if needed */}
                  </Marker>
                ) : null
              ))}
            </MapContainer>
          </div>
        )}
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
