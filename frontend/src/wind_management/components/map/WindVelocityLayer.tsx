import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-velocity";
import "leaflet-velocity/dist/leaflet-velocity.css";
import { useWindStore } from "../../stores/useWindStore";
import { useWindVelocityData } from "../../hooks/useWindVelocityData";

export const WindVelocityLayer: React.FC = () => {
  const map = useMap();
  const velocityLayerRef = useRef<L.Layer | null>(null);
  const heatmapLayerRef = useRef<L.Layer | null>(null);
  const setCurrentGridData = useWindStore(
    (state: any) => state.setCurrentGridData,
  );

  const data = useWindVelocityData();

  useEffect(() => {
    setCurrentGridData(data);
    return () => {
      setCurrentGridData(null);
    };
  }, [data, setCurrentGridData]);

  useEffect(() => {
    // Zoom, pan and set max bounds to restrict user panning to Gulf of Tonkin
    const bounds = L.latLngBounds([17.0, 105.0], [21.0, 110.0]);
    map.setMaxBounds(bounds);
    map.setView([19.0, 107.5], 7);

    return () => {
      map.setMaxBounds(null as any);
    };
  }, [map]);

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
        const uVal = hasU ? u[r][c] || 0 : 0;
        const vVal = hasV ? v[r][c] || 0 : 0;
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
        },
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
