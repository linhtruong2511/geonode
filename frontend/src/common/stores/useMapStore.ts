import { create } from 'zustand';

interface MapState {
  showMap: boolean;
  mapData: any[];
  mapCenter: [number, number];
  mapZoom: number;
  setShowMap: (show: boolean) => void;
  setMapData: (data: any[]) => void;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
}

export const useMapStore = create<MapState>((set) => ({
  showMap: false,
  mapData: [],
  mapCenter: [16.047079, 108.206230], // Default center (Vietnam)
  mapZoom: 5,
  setShowMap: (show) => set({ showMap: show }),
  setMapData: (data) => set({ mapData: data }),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
}));
