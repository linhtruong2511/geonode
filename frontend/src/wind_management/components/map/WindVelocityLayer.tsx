import React, { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-velocity";
import "leaflet-velocity/dist/leaflet-velocity.css";
import axios from "axios";
import { useWindStore } from "../../stores/useWindStore";
import { useMapStore } from "@common/stores/useMapStore";

export const WindVelocityLayer: React.FC = () => {
  const map = useMap();
  const currentTime = useWindStore((state) => state.currentTime);
  const activeGridLayers = useWindStore((state) => state.activeGridLayers);
  const datasetVariables = useWindStore((state) => state.datasetVariables);
  const mapBounds = useMapStore((state) => state.mapBounds);
  const velocityLayerRef = useRef<any>(null);
  const heatmapLayerRef = useRef<any>(null);
  const [data, setData] = useState<any>(null);
  const setCurrentGridData = useWindStore((state) => state.setCurrentGridData);

  useEffect(() => {
    setCurrentGridData(data);
    return () => {
      setCurrentGridData(null);
    };
  }, [data, setCurrentGridData]);

  // Bounds for Gulf of Tonkin (Vịnh Bắc Bộ)
  const GULF_OF_TONKIN_BBOX = {
    min_lon: 105.0,
    min_lat: 17.0,
    max_lon: 110.0,
    max_lat: 21.0,
  };

  useEffect(() => {
    // Zoom, pan and set max bounds to restrict user panning to Gulf of Tonkin
    const bounds = L.latLngBounds([17.0, 105.0], [21.0, 110.0]);
    map.setMaxBounds(bounds);
    map.setView([19.0, 107.5], 7);
    
    return () => {
      map.setMaxBounds(null as any);
    };
  }, [map]);

  const selectedDatasetId = useWindStore((state) => state.selectedDatasetId);
  const lastDatasetIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    return () => {
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current);
        heatmapLayerRef.current = null;
      }
    };
  }, [map]);

  useEffect(() => {
    // If dataset changes, immediately clear data and remove layers to prevent stacking
    if (selectedDatasetId !== lastDatasetIdRef.current) {
      lastDatasetIdRef.current = selectedDatasetId;
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current);
        heatmapLayerRef.current = null;
      }
      setData(null);
    }
    if (!currentTime || activeGridLayers.length === 0) {
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current);
        heatmapLayerRef.current = null;
      }
      setData(null);
      return;
    }

    // Determine u and v parameters based on activeVar and datasetVariables
    const activeVar = activeGridLayers[0];
    let uParam: string | undefined = undefined;
    let vParam: string | undefined = undefined;

    if (activeVar) {
      if (activeVar.startsWith("u")) {
        uParam = activeVar;
        const suffix = activeVar.slice(1);
        vParam = `v${suffix}`;
      } else if (activeVar.startsWith("v")) {
        vParam = activeVar;
        const suffix = activeVar.slice(1);
        uParam = `u${suffix}`;
      } else {
        uParam = activeVar;
      }
    }

    // Validate existence in loaded variables
    const validCodes = datasetVariables.map(v => v.variable_code);
    if (uParam && validCodes.length > 0 && !validCodes.includes(uParam)) {
      uParam = undefined;
    }
    if (vParam && validCodes.length > 0 && !validCodes.includes(vParam)) {
      vParam = undefined;
    }

    // Must have at least one valid parameter
    if (!uParam && !vParam) {
      return;
    }

    // Compute intersected bbox
    let minLon = GULF_OF_TONKIN_BBOX.min_lon;
    let minLat = GULF_OF_TONKIN_BBOX.min_lat;
    let maxLon = GULF_OF_TONKIN_BBOX.max_lon;
    let maxLat = GULF_OF_TONKIN_BBOX.max_lat;

    if (mapBounds) {
      minLon = Math.max(GULF_OF_TONKIN_BBOX.min_lon, mapBounds.west);
      minLat = Math.max(GULF_OF_TONKIN_BBOX.min_lat, mapBounds.south);
      maxLon = Math.min(GULF_OF_TONKIN_BBOX.max_lon, mapBounds.east);
      maxLat = Math.min(GULF_OF_TONKIN_BBOX.max_lat, mapBounds.north);
    }

    // Guard coordinates logic
    if (minLon >= maxLon || minLat >= maxLat) {
      minLon = GULF_OF_TONKIN_BBOX.min_lon;
      minLat = GULF_OF_TONKIN_BBOX.min_lat;
      maxLon = GULF_OF_TONKIN_BBOX.max_lon;
      maxLat = GULF_OF_TONKIN_BBOX.max_lat;
    }

    const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`;

    // Build query params
    const params: any = {
      time: currentTime,
      bbox: bboxStr,
      step: 1,
    };
    if (uParam) params.u = uParam;
    if (vParam) params.v = vParam;

    // Fetch raw grid data using the detail=False action which accepts time directly
    axios
      .get("/wind/api/v1/raster-granules/data/", { params })
      .then((dataRes) => {
        setData(dataRes.data);
      })
      .catch((err) => {
        console.error("Error fetching wind velocity grid data:", err);
      });
  }, [currentTime, activeGridLayers, datasetVariables, mapBounds, selectedDatasetId]);

  useEffect(() => {
    if (!data || (!data.u && !data.v)) {
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current);
        heatmapLayerRef.current = null;
      }
      return;
    }

    const { lats, lons, u, v } = data;
    const nx = lons.length;
    const ny = lats.length;
    const lo1 = lons[0];
    const la1 = lats[0];
    const lo2 = lons[lons.length - 1];
    const la2 = lats[lats.length - 1];
    const dx = nx > 1 ? (lo2 - lo1) / (nx - 1) : 0;
    const dy = ny > 1 ? Math.abs(la1 - la2) / (ny - 1) : 0;

    const hasU = u && u.length > 0;
    const hasV = v && v.length > 0;

    // Speeds matrix
    const speeds: number[][] = [];
    for (let r = 0; r < ny; r++) {
      speeds[r] = [];
      for (let c = 0; c < nx; c++) {
        const uVal = hasU ? (u[r][c] || 0) : 0;
        const vVal = hasV ? (v[r][c] || 0) : 0;
        if (hasU && hasV) {
          speeds[r][c] = Math.sqrt(uVal * uVal + vVal * vVal);
        } else {
          speeds[r][c] = hasU ? Math.abs(uVal) : Math.abs(vVal);
        }
      }
    }

    const getColorForSpeed = (speed: number) => {
      const s = Math.min(25, Math.max(0, speed));
      const hue = Math.max(0, 240 - (s / 25) * 240);
      return `hsla(${hue}, 85%, 55%, 0.5)`;
    };

    // Pre-render the speeds grid to a tiny offscreen canvas for smooth bilinear interpolation by the browser
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = nx;
    offscreenCanvas.height = ny;
    const offscreenCtx = offscreenCanvas.getContext("2d");

    if (offscreenCtx) {
      for (let r = 0; r < ny; r++) {
        for (let c = 0; c < nx; c++) {
          offscreenCtx.fillStyle = getColorForSpeed(speeds[r][c]);
          offscreenCtx.fillRect(c, r, 1, 1);
        }
      }
    }

    // Min and Max lat/lon of dataset for geographic alignment
    const maxLat = Math.max(...lats);
    const minLat = Math.min(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    // Keep track of old layers
    const oldHeatmap = heatmapLayerRef.current;
    const oldVelocity = velocityLayerRef.current;

    let newHeatmapLayer: any = null;
    let newVelocityLayer: any = null;

    // 2. Create Grid-based Heatmap Layer (Canvas)
    try {
      const HeatmapCanvasLayer = (L.GridLayer as any).extend({
        options: {
          pane: "overlayPane",
        },
        createTile: function (coords: any) {
          const tile = L.DomUtil.create("canvas", "leaflet-tile");
          const size = this.getTileSize();
          tile.width = size.x;
          tile.height = size.y;
          const ctx = tile.getContext("2d");

          if (!ctx) return tile;

          // Project the dataset bounding box to tile relative coordinates
          const pNW = map.project(L.latLng(maxLat, minLon), coords.z);
          const pSE = map.project(L.latLng(minLat, maxLon), coords.z);

          const x1 = pNW.x - coords.x * size.x;
          const y1 = pNW.y - coords.y * size.y;
          const x2 = pSE.x - coords.x * size.x;
          const y2 = pSE.y - coords.y * size.y;

          // Draw the offscreen canvas scaled smoothly to the tile canvas
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(offscreenCanvas, x1, y1, x2 - x1, y2 - y1);

          return tile;
        }
      });

      newHeatmapLayer = new HeatmapCanvasLayer();
      newHeatmapLayer.addTo(map);
      heatmapLayerRef.current = newHeatmapLayer;
    } catch (e) {
      console.error("Error creating heatmap grid layer:", e);
    }

    // 3. Create Velocity flow Layer (Leaflet Velocity) if both U and V are available
    if (hasU && hasV) {
      const uData = [];
      const vData = [];

      for (let r = 0; r < ny; r++) {
        for (let c = 0; c < nx; c++) {
          uData.push(u[r][c] !== null ? u[r][c] : 0);
          vData.push(v[r][c] !== null ? v[r][c] : 0);
        }
      }

      const velocityData = [
        {
          header: {
            parameterCategory: 2,
            parameterNumber: 2,
            nx,
            ny,
            lo1,
            la1,
            lo2,
            la2,
            dx,
            dy,
          },
          data: uData,
        },
        {
          header: {
            parameterCategory: 2,
            parameterNumber: 3,
            nx,
            ny,
            lo1,
            la1,
            lo2,
            la2,
            dx,
            dy,
          },
          data: vData,
        },
      ];

      try {
        newVelocityLayer = (L as any).velocityLayer({
          displayValues: true,
          displayOptions: {
            velocityType: "Global Wind",
            position: "bottomleft",
            emptyString: "No wind data",
          },
          data: velocityData,
          maxVelocity: 15,
          velocityScale: 0.005,
        });

        newVelocityLayer.addTo(map);
        velocityLayerRef.current = newVelocityLayer;
      } catch (e) {
        console.error("Error creating velocity layer:", e);
      }
    }

    // Safely remove old layers after the new layers have been mounted and painted
    const cleanupTimeout = setTimeout(() => {
      if (oldHeatmap && map.hasLayer(oldHeatmap)) {
        map.removeLayer(oldHeatmap);
      }
      if (oldVelocity && map.hasLayer(oldVelocity)) {
        map.removeLayer(oldVelocity);
      }
    }, 80);

    return () => {
      clearTimeout(cleanupTimeout);
    };
  }, [data, map]);

  return null;
};
