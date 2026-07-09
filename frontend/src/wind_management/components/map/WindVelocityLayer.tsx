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
  const mapBounds = useMapStore((state) => state.mapBounds);
  const velocityLayerRef = useRef<any>(null);
  const [data, setData] = useState<any>(null);

  // Bounds for Gulf of Tonkin (Vịnh Bắc Bộ)
  const GULF_OF_TONKIN_BBOX = {
    min_lon: 105.0,
    min_lat: 17.0,
    max_lon: 110.0,
    max_lat: 21.0,
  };

  useEffect(() => {
    // Zoom and pan map to Gulf of Tonkin when layer is active
    map.setView([19.0, 107.5], 7);
  }, [map]);

  useEffect(() => {
    if (!currentTime || activeGridLayers.length === 0) {
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
      setData(null);
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

    // Fetch raw grid data using the detail=False action which accepts time directly
    axios
      .get("/wind/api/v1/raster-granules/data/", {
        params: {
          time: currentTime,
          bbox: bboxStr,
          step: 1,
          variable_code: activeGridLayers[0],
        },
      })
      .then((dataRes) => {
        setData(dataRes.data);
      })
      .catch((err) => {
        console.error("Error fetching wind velocity grid data:", err);
      });
  }, [currentTime, activeGridLayers, mapBounds]);

  useEffect(() => {
    if (velocityLayerRef.current) {
      map.removeLayer(velocityLayerRef.current);
      velocityLayerRef.current = null;
    }

    if (!data || !data.u || data.u.length === 0) return;

    const { lats, lons, u, v } = data;
    const nx = lons.length;
    const ny = lats.length;
    const lo1 = lons[0];
    const la1 = lats[0];
    const lo2 = lons[lons.length - 1];
    const la2 = lats[lats.length - 1];
    const dx = nx > 1 ? (lo2 - lo1) / (nx - 1) : 0;
    const dy = ny > 1 ? Math.abs(la1 - la2) / (ny - 1) : 0;

    const uData = [];
    const vData = [];

    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        uData.push(u[r][c] !== null ? u[r][c] : 0);
        vData.push(v && v[r] ? (v[r][c] !== null ? v[r][c] : 0) : 0);
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
      const velocityLayer = (L as any).velocityLayer({
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

      velocityLayer.addTo(map);
      velocityLayerRef.current = velocityLayer;
    } catch (e) {
      console.error("Error creating velocity layer:", e);
    }

    return () => {
      if (velocityLayerRef.current) {
        map.removeLayer(velocityLayerRef.current);
        velocityLayerRef.current = null;
      }
    };
  }, [data, map]);

  return null;
};
