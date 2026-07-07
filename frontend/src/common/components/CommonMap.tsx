import React, { useEffect } from "react";
import { useMapStore } from "../stores/useMapStore";
import { MapContainer, TileLayer, useMapEvents, useMap, LayersControl } from "react-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet/dist/leaflet.css";

export const GeomanControl: React.FC = () => {
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

export const MapBoundsSync: React.FC = () => {
  const setMapBounds = useMapStore((state) => state.setMapBounds);
  const isDrawingMode = useMapStore((state) => state.isDrawingMode);

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
  });

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

  return null;
};

export const MapViewUpdater: React.FC = () => {
  const map = useMap();
  const mapCenter = useMapStore((state) => state.mapCenter);
  const mapZoom = useMapStore((state) => state.mapZoom);

  useEffect(() => {
    if (mapCenter) {
      map.setView(mapCenter, mapZoom, { animate: false });
    }
  }, [mapCenter, mapZoom, map]);

  return null;
};

interface CommonMapProps {
  children?: React.ReactNode;
}

export const CommonMap: React.FC<CommonMapProps> = ({ children }) => {
  const mapCenter = useMapStore((state) => state.mapCenter);
  const mapZoom = useMapStore((state) => state.mapZoom);

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      style={{ height: "100%", width: "100%" }}
    >
      <MapViewUpdater />
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
      <MapBoundsSync />
      <GeomanControl />
      
      {children}
    </MapContainer>
  );
};
