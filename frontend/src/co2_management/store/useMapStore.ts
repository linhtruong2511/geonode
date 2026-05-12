import { create } from 'zustand';

interface MapPoint {
  id: number | string;
  latitude: number;
  longitude: number;
  xco2_ppm: number;
  data_source: string;
  [key: string]: any;
}

interface MapState {
  points: MapPoint[];
  focusedPoint: [number, number] | null;
  activePointId: number | string | null;
  mapConfig: {
    center: [number, number];
    zoom: number;
  };
  
  // Actions
  setPoints: (points: MapPoint[]) => void;
  focusPoint: (lat: number, lng: number) => void;
  setActivePointId: (id: number | string | null) => void;
  resetFocus: () => void;
  setMapConfig: (config: { center: [number, number]; zoom: number }) => void;
}

export const useMapStore = create<MapState>((set) => ({
  points: [],
  focusedPoint: null,
  activePointId: null,
  mapConfig: {
    center: [16.0, 107.0], // Mặc định Việt Nam
    zoom: 5
  },

  setPoints: (points) => set({ points }),
  
  focusPoint: (lat, lng) => set({ 
    focusedPoint: [lat, lng],
    mapConfig: { center: [lat, lng], zoom: 12 } // Tự động zoom gần khi focus
  }),
  
  setActivePointId: (id) => set({ activePointId: id }),
  
  resetFocus: () => set({ focusedPoint: null }),
  
  setMapConfig: (config) => set({ mapConfig: config })
}));
