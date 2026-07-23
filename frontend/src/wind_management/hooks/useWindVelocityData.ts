import { useState, useEffect, useRef } from "react";
import { useWindStore } from "../stores/useWindStore";
import { useMapStore } from "@common/stores/useMapStore";
import { windApi } from "../services/windApi";

const GULF_OF_TONKIN_BBOX = {
  min_lon: 105.0,
  min_lat: 17.0,
  max_lon: 110.0,
  max_lat: 21.0,
};

export function useWindVelocityData() {
  const currentTime = useWindStore((state: any) => state.currentTime);
  const activeGridLayers = useWindStore((state: any) => state.activeGridLayers);
  const datasetVariables = useWindStore((state: any) => state.datasetVariables);
  const selectedDatasetId = useWindStore((state: any) => state.selectedDatasetId);
  const mapBounds = useMapStore((state: any) => state.mapBounds);

  const [data, setData] = useState<any>(null);
  const lastDatasetIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // If dataset changes, immediately clear data
    if (selectedDatasetId !== lastDatasetIdRef.current) {
      lastDatasetIdRef.current = selectedDatasetId;
      setData(null);
    }
    if (!currentTime || activeGridLayers.length === 0) {
      setData(null);
      return;
    }

    const activeVar = activeGridLayers[0];
    let uParam: string | undefined = undefined;
    let vParam: string | undefined = undefined;

    if (activeVar) {
      if (activeVar.startsWith("u")) {
        uParam = activeVar;
        vParam = `v${activeVar.slice(1)}`;
      } else if (activeVar.startsWith("v")) {
        vParam = activeVar;
        uParam = `u${activeVar.slice(1)}`;
      } else {
        uParam = activeVar;
      }
    }

    const validCodes = datasetVariables.map((v: any) => v.variable_code);
    if (uParam && validCodes.length > 0 && !validCodes.includes(uParam)) uParam = undefined;
    if (vParam && validCodes.length > 0 && !validCodes.includes(vParam)) vParam = undefined;

    if (!uParam && !vParam) return;

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

    if (minLon >= maxLon || minLat >= maxLat) {
      minLon = GULF_OF_TONKIN_BBOX.min_lon;
      minLat = GULF_OF_TONKIN_BBOX.min_lat;
      maxLon = GULF_OF_TONKIN_BBOX.max_lon;
      maxLat = GULF_OF_TONKIN_BBOX.max_lat;
    }

    const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`;
    const params: any = { time: currentTime, bbox: bboxStr, step: 1 };
    if (uParam) params.u = uParam;
    if (vParam) params.v = vParam;

    windApi.getRasterGranulesData(params)
      .then(setData)
      .catch(err => console.error("Error fetching wind velocity grid data:", err));
  }, [currentTime, activeGridLayers, datasetVariables, mapBounds, selectedDatasetId]);

  return data;
}
