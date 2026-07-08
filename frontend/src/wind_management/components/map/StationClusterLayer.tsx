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

const WindStationMarker: React.FC<{ item: any; focusedId: number | null }> = ({ item, focusedId }) => {
  const markerRef = useRef<any>(null);
  const { setSelectedStationId } = useWindStore();
  const [detailData, setDetailData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  useEffect(() => {
    if (markerRef.current && focusedId === item.id) {
      setTimeout(() => {
        markerRef.current?.openPopup();
      }, 100);
    }
  }, [focusedId, item.id]);

  const handleOpenPopup = () => {
    setLoading(true);
    axios.get(`/wind/api/v1/stations/${item.id}/`)
      .then(res => {
        setDetailData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching station detail", err);
        setLoading(false);
      });
  };

  const isFocused = focusedId === item.id;
  const val = item.wind_speed !== undefined && item.wind_speed !== null ? parseFloat(item.wind_speed) : 0;

  return (
    <CircleMarker
      ref={markerRef}
      center={[item.lat || item.latitude || 0, item.lon || item.longitude || 0]}
      radius={isFocused ? 10 : 6}
      pathOptions={{
        fillColor: getColor('wind_speed', val),
        color: isFocused ? '#ef4444' : '#fff',
        weight: isFocused ? 3 : 1,
        opacity: 1,
        fillOpacity: 0.9,
      }}
      eventHandlers={{
        click: () => {
          setSelectedStationId(item.id);
        },
        popupopen: () => {
          handleOpenPopup();
        }
      }}
    >
      <Popup autoPan={false}>
        <div style={{ fontSize: "11px", minWidth: "180px", padding: "2px" }}>
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '5px', marginBottom: '5px', fontWeight: 700 }}>
            Trạm: <a href={`#/stations/${item.id}`} style={{ color: '#397aab', textDecoration: 'underline', cursor: 'pointer' }} title="Xem chi tiết trạm">
              {item.name || `Station #${item.id}`} ({item.station_code}) <i className="fa fa-external-link" style={{ fontSize: '10px', marginLeft: '2px' }}></i>
            </a>
          </div>
          <strong>Cao độ:</strong> {item.elevation ? `${item.elevation}m` : 'N/A'}<br />
          <strong>Tọa độ:</strong> {(item.lat || item.latitude || 0).toFixed(4)}, {(item.lon || item.longitude || 0).toFixed(4)}<br />
          
          {loading ? (
            <div style={{ marginTop: '5px', color: '#64748b' }}>
              <i className="fa fa-spinner fa-spin"></i> Đang tải đo đạc mới nhất...
            </div>
          ) : detailData?.properties?.latest_observation ? (
            <div style={{ marginTop: '5px', borderTop: '1px dashed #cbd5e1', paddingTop: '5px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>Đo đạc mới nhất:</div>
              <div>Thời gian: {new Date(detailData.properties.latest_observation.obs_time).toLocaleString('vi-VN')}</div>
              <div>Nhiệt độ: {detailData.properties.latest_observation.temp_2m !== null ? `${detailData.properties.latest_observation.temp_2m} °C` : 'N/A'}</div>
              <div>Tốc độ gió: {detailData.properties.latest_observation.wind_speed !== null ? `${detailData.properties.latest_observation.wind_speed} m/s` : 'N/A'}</div>
              <div>Hướng gió: {detailData.properties.latest_observation.wind_dir !== null ? `${detailData.properties.latest_observation.wind_dir}°` : 'N/A'}</div>
              <div>Độ ẩm: {detailData.properties.latest_observation.humidity !== null ? `${detailData.properties.latest_observation.humidity}%` : 'N/A'}</div>
              <div>Khí áp: {detailData.properties.latest_observation.pressure !== null ? `${detailData.properties.latest_observation.pressure} hPa` : 'N/A'}</div>
            </div>
          ) : (
            <div style={{ marginTop: '5px', fontStyle: 'italic', color: '#64748b' }}>Không có dữ liệu đo đạc mới nhất</div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
};

export const StationClusterLayer: React.FC = () => {
  const setMapData = useMapStore((state) => state.setMapData);
  const mapData = useMapStore((state) => state.mapData);
  const focusedId = useMapStore((state) => state.focusedId);
  const { showStations } = useWindStore();

  useEffect(() => {
    if (showStations) {
      axios.get('/wind/api/v1/stations/')
        .then(res => {
          // serializer trả về GeoJSON dạng FeatureCollection, hỗ trợ phân trang
          const features = res.data.results?.features || res.data.features || [];
          const parsedStations = features.map((f: any) => ({
            id: f.id,
            name: f.properties.name,
            station_code: f.properties.station_code,
            elevation: f.properties.elevation,
            station_type: f.properties.station_type,
            // GeoJSON geometry coords: [lng, lat]
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            wind_speed: f.properties.latest_observation?.wind_speed !== undefined && f.properties.latest_observation?.wind_speed !== null ? parseFloat(f.properties.latest_observation.wind_speed) : 0,
            wind_dir: f.properties.latest_observation?.wind_dir !== undefined && f.properties.latest_observation?.wind_dir !== null ? parseFloat(f.properties.latest_observation.wind_dir) : 180
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
          <WindStationMarker key={item.id} item={item} focusedId={focusedId} />
        ) : null
      )}
    </>
  );
};
