import { create } from 'zustand';

interface WindState {
  // A6: Time Slider & Animation
  currentTime: string | null; 
  timeRange: [string, string] | null;
  isPlayingAnimation: boolean;
  
  // A1, A4: Map Layers
  activeGridLayers: string[];
  isSplitView: boolean;
  leftLayer: string | null;
  rightLayer: string | null;

  // B1, B3: Filters
  selectedVariables: string[];
  selectedEventId: number | null;
  searchQuery: string;
  
  // A5, B5: Charts & Selection
  selectedStationId: number | null;
  selectedGridPoint: { lat: number, lng: number } | null;

  // Map settings
  showStations: boolean;
  gridOpacity: number;

  // Actions
  setCurrentTime: (time: string | null) => void;
  setTimeRange: (range: [string, string] | null) => void;
  setIsPlayingAnimation: (playing: boolean) => void;
  toggleGridLayer: (layerId: string) => void;
  setIsSplitView: (isSplit: boolean) => void;
  setLeftLayer: (layer: string | null) => void;
  setRightLayer: (layer: string | null) => void;
  setSelectedVariables: (vars: string[]) => void;
  setSelectedEventId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedStationId: (id: number | null) => void;
  setSelectedGridPoint: (point: { lat: number, lng: number } | null) => void;
  setShowStations: (show: boolean) => void;
  setGridOpacity: (opacity: number) => void;
}

export const useWindStore = create<WindState>((set) => ({
  currentTime: null,
  timeRange: null,
  isPlayingAnimation: false,
  activeGridLayers: [],
  isSplitView: false,
  leftLayer: null,
  rightLayer: null,
  selectedVariables: ['wind_speed'],
  selectedEventId: null,
  searchQuery: '',
  selectedStationId: null,
  selectedGridPoint: null,
  showStations: true,
  gridOpacity: 0.8,

  setCurrentTime: (time) => set({ currentTime: time }),
  setTimeRange: (range) => set({ timeRange: range }),
  setIsPlayingAnimation: (playing) => set({ isPlayingAnimation: playing }),
  toggleGridLayer: (layerId) => set((state) => ({
    activeGridLayers: state.activeGridLayers.includes(layerId)
      ? state.activeGridLayers.filter(l => l !== layerId)
      : [...state.activeGridLayers, layerId]
  })),
  setIsSplitView: (isSplit) => set({ isSplitView: isSplit }),
  setLeftLayer: (layer) => set({ leftLayer: layer }),
  setRightLayer: (layer) => set({ rightLayer: layer }),
  setSelectedVariables: (vars) => set({ selectedVariables: vars }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedStationId: (id) => set({ selectedStationId: id }),
  setSelectedGridPoint: (point) => set({ selectedGridPoint: point }),
  setShowStations: (show) => set({ showStations: show }),
  setGridOpacity: (opacity) => set({ gridOpacity: opacity }),
}));
