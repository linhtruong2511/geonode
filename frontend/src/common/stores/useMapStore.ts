import { create } from 'zustand';

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapState {
  showMap: boolean;
  mapData: any[];
  mapCenter: [number, number];
  mapZoom: number;
  mapBounds: MapBounds | null;
  mousePos: { lat: number; lng: number } | null;
  drawnGeometry: any | null; // GeoJSON or Leaflet layer
  isSpatialSearchEnabled: boolean;
  isDrawingMode: boolean;
  isPickingLocation: boolean;
  pickedLocation: [number, number] | null;
  setShowMap: (show: boolean) => void;
  setMapData: (data: any[]) => void;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
  setMapBounds: (bounds: MapBounds | null) => void;
  setMousePos: (pos: { lat: number; lng: number } | null) => void;
  setDrawnGeometry: (geometry: any | null) => void;
  setIsSpatialSearchEnabled: (enabled: boolean) => void;
  setIsDrawingMode: (enabled: boolean) => void;
  setIsPickingLocation: (enabled: boolean) => void;
  setPickedLocation: (location: [number, number] | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  showMap: false,
  mapData: [],
  mapCenter: [16.047079, 108.206230],
  mapZoom: 5,
  mapBounds: null,
  mousePos: null,
  drawnGeometry: null,
  isSpatialSearchEnabled: false,
  isDrawingMode: false,
  isPickingLocation: false,
  pickedLocation: null,
  setShowMap: (show) => set({ showMap: show }),
  setMapData: (data) => set({ mapData: data }),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  setMousePos: (pos) => set({ mousePos: pos }),
  setDrawnGeometry: (geometry) => set({ drawnGeometry: geometry }),
  setIsSpatialSearchEnabled: (enabled) => set({ isSpatialSearchEnabled: enabled }),
  setIsDrawingMode: (enabled) => set({ isDrawingMode: enabled }),
  setIsPickingLocation: (enabled) => set({ isPickingLocation: enabled }),
  setPickedLocation: (location) => set({ pickedLocation: location }),
}));
