import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { CommonMap } from "./CommonMap";

export interface NavLinkDef {
  to: string;
  icon: string;
  label: string;
}

export interface SharedLayoutProps {
  appName: string;
  appVersion?: string;
  appIcon?: React.ReactNode;
  navLinks: NavLinkDef[];
  routeNames: Record<string, string>;
  mapOverlay?: React.ReactNode;
  mapLegend?: React.ReactNode;
  mapMarkers?: React.ReactNode;
  layersControlOverlays?: React.ReactNode;
  isFullWidthPage?: (pathname: string) => boolean;
  children: React.ReactNode;
}

export const SharedLayout: React.FC<SharedLayoutProps> = ({
  appName,
  appVersion = "v1.0 (React)",
  appIcon = <i className="fa fa-globe fa-2x" style={{ color: "#397aab" }}></i>,
  navLinks,
  routeNames,
  mapOverlay,
  mapLegend,
  mapMarkers,
  layersControlOverlays,
  isFullWidthPage,
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("shared-sidebar-collapsed") === "true";
  });
  const [contentWidth, setContentWidth] = useState(() => {
    const saved = localStorage.getItem("shared-content-width");
    return saved ? parseInt(saved, 10) : 0; 
  });
  const [isDragging, setIsDragging] = useState(false);

  const contentPanelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const location = useLocation();

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (routeNames[path]) return routeNames[path];
    return 'Tổng quan';
  };

  useEffect(() => {
    localStorage.setItem("shared-sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (contentWidth > 0) {
      localStorage.setItem("shared-content-width", String(contentWidth));
    }
  }, [contentWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = contentPanelRef.current?.getBoundingClientRect().width || 0;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current - dx;
      if (newWidth > 300 && newWidth < 1200) {
        setContentWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.dispatchEvent(new Event("resize"));
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

  const isFullWidth = isFullWidthPage ? isFullWidthPage(location.pathname) : false;

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
        
        {!isCollapsed && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            {appIcon}
            <h3 style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#fff' }}>{appName}</h3>
          </div>
        )}

        <nav className="sidebar-nav">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`sidebar-nav-item ${isActive(link.to) ? "active" : ""}`}
              data-tooltip={link.label}
            >
              <span className="nav-icon">
                <i className={`fa ${link.icon}`}></i>
              </span>
              <span className="nav-label">{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">{appName} {appVersion}</div>
      </aside>

      {isFullWidth ? (
        <div id="co2-content-panel" style={{ flex: 1, maxWidth: "none", borderLeft: "none" }}>
          <div id="co2-topbar">
            <div className="topbar-breadcrumb">
              {appName} / <span>{getBreadcrumb()}</span>
            </div>
          </div>
          <div id="co2-content-body">{children}</div>
        </div>
      ) : (
        /* SPLIT CONTAINER */
        <div id="co2-split-container">
          {/* CENTER MAP PANEL */}
          <div id="co2-map-panel">
            <CommonMap layersControlOverlays={layersControlOverlays}>
              {mapOverlay}
              {mapMarkers}
            </CommonMap>
            {mapLegend}
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
                {appName} / <span>{getBreadcrumb()}</span>
              </div>
            </div>
            <div id="co2-content-body">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
};
