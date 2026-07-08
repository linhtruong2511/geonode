import React from 'react';
import { WMSTileLayer } from 'react-leaflet';
import { useWindStore } from '../../stores/useWindStore';

export const WMSGridLayer: React.FC = () => {
  const { activeGridLayers, currentTime, gridOpacity } = useWindStore();

  if (activeGridLayers.length === 0) return null;

  return (
    <>
      {activeGridLayers.map(layer => (
        <WMSTileLayer
          key={`${layer}-${currentTime || 'latest'}`}
          url="/geoserver/wms"
          layers={`geonode:${layer}`}
          format="image/png"
          transparent={true}
          opacity={gridOpacity}
          {...(currentTime ? { time: currentTime } : {})}
        />
      ))}
    </>
  );
};
