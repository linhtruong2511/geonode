import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMapStore } from '@common/stores/useMapStore';
import { useWindStore } from '../stores/useWindStore';

interface Station {
  id: number;
  name: string;
  station_code: string;
  elevation: number;
  station_type: string;
  lat: number;
  lon: number;
}

const StationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setMapCenter = useMapStore((state) => state.setMapCenter);
  const setMapZoom = useMapStore((state) => state.setMapZoom);
  const setFocusedId = useMapStore((state) => state.setFocusedId);
  const { setSelectedStationId, showStations, setShowStations } = useWindStore();

  useEffect(() => {
    // Đảm bảo bật hiển thị trạm trên bản đồ khi vào trang này
    if (!showStations) {
      setShowStations(true);
    }

    axios.get('/wind/api/v1/stations/')
      .then((res) => {
        // Hỗ trợ cả trường hợp API có phân trang (res.data.results.features) hoặc không phân trang (res.data.features)
        const features = res.data.results?.features || res.data.features || [];
        const parsedStations: Station[] = features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          station_code: f.properties.station_code,
          elevation: f.properties.elevation,
          station_type: f.properties.station_type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }));
        setStations(parsedStations);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching stations:', err);
        setError('Không thể tải danh sách trạm quan trắc.');
        setLoading(false);
      });
  }, []);

  const handleLocateStation = (station: Station) => {
    // Định vị trạm trên bản đồ Leaflet bên trái
    setMapCenter([station.lat, station.lon]);
    setMapZoom(12);
    setFocusedId(station.id);
    setSelectedStationId(station.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="co2-card">
        <div className="co2-card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
          <h3>Danh sách Trạm Quan Trắc</h3>
          <span className="badge" style={{ backgroundColor: 'var(--color-accent-primary)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
            {stations.length} trạm
          </span>
        </div>
        <div className="co2-card-body">
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)', marginBottom: '10px' }}></i>
              <p>Đang tải dữ liệu trạm quan trắc...</p>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--color-accent-red)', textAlign: 'center', padding: '20px 0' }}>
              <i className="fa fa-exclamation-triangle fa-2x" style={{ marginBottom: '10px' }}></i>
              <p>{error}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="co2-table">
                <thead>
                  <tr>
                    <th>Mã trạm</th>
                    <th>Tên trạm</th>
                    <th>Loại trạm</th>
                    <th>Tọa độ (Vĩ độ, Kinh độ)</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((station) => (
                    <tr key={station.id}>
                       <td style={{ fontWeight: 600 }}>{station.station_code}</td>
                      <td>{station.name}</td>
                      <td>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          backgroundColor: station.station_type === 'synop' ? '#e0f2fe' : '#fef3c7',
                          color: station.station_type === 'synop' ? '#0369a1' : '#b45309',
                          fontWeight: 500
                        }}>
                          {station.station_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono" style={{ fontSize: '11px' }}>
                        {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                          <i
                            className="fa fa-chart-line"
                            onClick={() => navigate(`/stations/${station.id}`)}
                            style={{
                              cursor: 'pointer',
                              color: 'var(--color-accent-primary)',
                              fontSize: '14px'
                            }}
                            title="Xem chi tiết"
                          ></i>
                          <i
                            className="fa fa-crosshairs"
                            onClick={() => handleLocateStation(station)}
                            style={{
                              cursor: 'pointer',
                              color: '#10b981',
                              fontSize: '14px'
                            }}
                            title="Định vị trên bản đồ"
                          ></i>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StationsPage;
