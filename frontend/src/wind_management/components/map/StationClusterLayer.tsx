import React, { useRef, useEffect } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { useMapStore } from '@common/stores/useMapStore';
import { useWindStore } from '../../stores/useWindStore';
import axios from 'axios';

// A function to get color based on variable and value
const getColor = (variable: string, value: number) => {
  if (variable === 'temp') {
    if (value >= 35) return "#d73027"; 
    if (value >= 30) return "#f46d43"; 
    if (value >= 25) return "#fdae61"; 
    if (value >= 20) return "#fee08b"; 
    if (value >= 10) return "#d9ef8b"; 
    return "#a6d96a";
  }
  // Default: wind_speed
  if (value >= 25) return "#7f0000"; 
  if (value >= 20) return "#d73027"; 
  if (value >= 15) return "#f46d43"; 
  if (value >= 10) return "#fdae61"; 
  if (value >= 5) return "#fee08b"; 
  return "#d9ef8b"; 
};

const WindStationMarker: React.FC<{ item: any; focusedId: number | null; activeVar: string }> = ({ item, focusedId, activeVar }) => {
  const markerRef = useRef<any>(null);
  const { setSelectedStationId } = useWindStore();

  useEffect(() => {
    if (markerRef.current && focusedId === item.id) {
      setTimeout(() => {
        markerRef.current?.openPopup();
      }, 100);
    }
  }, [focusedId, item.id]);

  const isFocused = focusedId === item.id;
  const val = activeVar === 'temp' ? (item.temp || 0) : (item.wind_speed || 0);

  return (
    <CircleMarker
      ref={markerRef}
      center={[item.lat || item.latitude || 0, item.lon || item.longitude || 0]}
      radius={isFocused ? 10 : 6}
      pathOptions={{
        fillColor: getColor(activeVar, val),
        color: isFocused ? '#ef4444' : '#fff',
        weight: isFocused ? 3 : 1,
        opacity: 1,
        fillOpacity: 0.9,
      }}
      eventHandlers={{
        click: () => {
          setSelectedStationId(item.id);
        }
      }}
    >
      <Popup autoPan={false}>
        <div style={{ fontSize: "11px", minWidth: "160px" }}>
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '3px', fontWeight: 700, color: '#397aab' }}>
            Trạm: {item.name || `Station #${item.id}`}
          </div>
          <strong>{activeVar === 'temp' ? 'Nhiệt độ' : 'Tốc độ gió'}:</strong> {val} {activeVar === 'temp' ? '°C' : 'm/s'}<br />
          <strong>Hướng gió:</strong> {item.wind_dir || 'N/A'}°<br />
          <strong>Tọa độ:</strong> {(item.lat || item.latitude || 0).toFixed(4)}, {(item.lon || item.longitude || 0).toFixed(4)}
        </div>
      </Popup>
    </CircleMarker>
  );
};

export const StationClusterLayer: React.FC = () => {
  const setMapData = useMapStore((state) => state.setMapData);
  const mapData = useMapStore((state) => state.mapData);
  const focusedId = useMapStore((state) => state.focusedId);
  const { selectedVariables, showStations } = useWindStore();
  
  const activeVar = selectedVariables.length > 0 ? selectedVariables[0] : 'wind_speed';

  useEffect(() => {
    if (showStations) {
      axios.get('/wind/api/v1/stations/')
        .then(res => {
          // serializer trả về GeoJSON dạng FeatureCollection
          const features = res.data.features || [];
          const parsedStations = features.map((f: any) => ({
            id: f.id,
            name: f.properties.name,
            station_code: f.properties.station_code,
            elevation: f.properties.elevation,
            station_type: f.properties.station_type,
            // GeoJSON geometry coords: [lng, lat]
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            wind_speed: 12, // mock value vì endpoint list trạm không kèm obs_speed realtime
            wind_dir: 180
          }));
          setMapData(parsedStations);
        })
        .catch(err => console.error("Error fetching stations", err));
    } else {
      setMapData([]);
    }
  }, [showStations, setMapData]);

  if (!showStations) return null;

  return (
    <>
      {mapData.map((item) =>
        (item.lat || item.latitude) && (item.lon || item.longitude) ? (
          <WindStationMarker key={item.id} item={item} focusedId={focusedId} activeVar={activeVar} />
        ) : null
      )}
    </>
  );
};
