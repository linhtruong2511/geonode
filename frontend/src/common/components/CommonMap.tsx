import React, { useEffect } from "react";
import { useMapStore } from "../stores/useMapStore";
import { MapContainer, TileLayer, useMapEvents, useMap, LayersControl, Marker, Circle } from "react-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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

// Fix default marker icon issue in Leaflet + React
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const ScanRadarEffect: React.FC<{ center: [number, number]; maxRadiusKm: number }> = ({ center, maxRadiusKm }) => {
  const [currentRadius, setCurrentRadius] = React.useState(0);

  useEffect(() => {
    let frameId: number;
    const start = performance.now();
    const duration = 1500; // 1.5 seconds for one cycle

    const animate = (timestamp: number) => {
      const elapsed = timestamp - start;
      const progress = (elapsed % duration) / duration; // 0 to 1
      setCurrentRadius(progress * maxRadiusKm * 1000); // convert to meters
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [maxRadiusKm]);

  return (
    <Circle
      center={center}
      radius={currentRadius}
      pathOptions={{
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 5'
      }}
    />
  );
};

const PickedLocationOverlay: React.FC = () => {
  const pickedLocation = useMapStore((state) => state.pickedLocation);
  const scanRadius = useMapStore((state) => state.scanRadius);
  const isScanning = useMapStore((state) => state.isScanning);

  if (!pickedLocation) return null;

  return (
    <>
      <Marker position={pickedLocation} icon={DefaultIcon} />
      <Circle
        center={pickedLocation}
        radius={scanRadius * 1000}
        pathOptions={{
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1.5
        }}
      />
      {isScanning && <ScanRadarEffect center={pickedLocation} maxRadiusKm={scanRadius} />}
    </>
  );
};

export const MapClickHandler: React.FC = () => {
  const isPickingLocation = useMapStore((state) => state.isPickingLocation);
  const setPickedLocation = useMapStore((state) => state.setPickedLocation);

  useMapEvents({
    click: (e) => {
      if (isPickingLocation) {
        setPickedLocation([e.latlng.lat, e.latlng.lng]);
      }
    }
  });

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
      <MapClickHandler />
      <PickedLocationOverlay />
      
      {children}
    </MapContainer>
  );
};
