import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useWindStore } from '../../stores/useWindStore';

export const SplitMapControl: React.FC = () => {
  const map = useMap();
  const { isSplitView, leftLayer, rightLayer, currentTime } = useWindStore();
  const leftLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const rightLayerRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    if (!isSplitView || (!leftLayer && !rightLayer)) {
      if (leftLayerRef.current) map.removeLayer(leftLayerRef.current);
      if (rightLayerRef.current) map.removeLayer(rightLayerRef.current);
      leftLayerRef.current = null;
      rightLayerRef.current = null;
      // Also remove sidebyside control if implemented
      return;
    }

    // Basic implementation just adding layers
    // For a real side-by-side, we would need 'leaflet-side-by-side' plugin
    // Here we just render them. In a real app, integrate the plugin.
    
    if (leftLayer) {
      if (!leftLayerRef.current) {
        leftLayerRef.current = L.tileLayer.wms('/geoserver/wms', {
          layers: `geonode:${leftLayer}`,
          format: 'image/png',
          transparent: true,
        }).addTo(map);
      } else {
        leftLayerRef.current.setParams({ layers: `geonode:${leftLayer}`, time: currentTime || undefined } as any);
      }
    } else if (leftLayerRef.current) {
      map.removeLayer(leftLayerRef.current);
      leftLayerRef.current = null;
    }

    if (rightLayer) {
      if (!rightLayerRef.current) {
        rightLayerRef.current = L.tileLayer.wms('/geoserver/wms', {
          layers: `geonode:${rightLayer}`,
          format: 'image/png',
          transparent: true,
        }).addTo(map);
      } else {
        rightLayerRef.current.setParams({ layers: `geonode:${rightLayer}`, time: currentTime || undefined } as any);
      }
    } else if (rightLayerRef.current) {
      map.removeLayer(rightLayerRef.current);
      rightLayerRef.current = null;
    }

  }, [isSplitView, leftLayer, rightLayer, currentTime, map]);

  return null;
};
