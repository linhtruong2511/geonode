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
  latest_observation?: any;
  wind_speed?: number;
  wind_dir?: number;
}

const StationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { 
    setIsPickingLocation, 
    pickedLocation, setPickedLocation, 
    scanRadius, setScanRadius, 
    isScanning, setIsScanning,
    setMapData,
    setMapCenter,
    setMapZoom,
    setFocusedId
  } = useMapStore();

  const { setSelectedStationId, showStations, setShowStations } = useWindStore();

  const [stationTypeFilter, setStationTypeFilter] = useState<string>('');
  const [windSpeedFilter, setWindSpeedFilter] = useState<string>('');
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  useEffect(() => {
    // Kích hoạt chế độ chọn vị trí trên bản đồ và dọn dẹp các trạm cũ
    setIsPickingLocation(true);
    setMapData([]);

    if (!showStations) {
      setShowStations(true);
    }

    return () => {
      // Hủy chế độ chọn vị trí khi thoát khỏi trang
      setIsPickingLocation(false);
      setPickedLocation(null);
      setIsScanning(false);
    };
  }, []);

  const handleScan = () => {
    if (!pickedLocation) return;
    setIsScanning(true);
    setLoading(true);
    setError(null);

    // Giả lập hiệu ứng quét radar 1.5s trước khi tải dữ liệu thực tế
    setTimeout(() => {
      axios.get('/wind/api/v1/stations/spatial_query/', {
        params: {
          lat: pickedLocation[0],
          lon: pickedLocation[1],
          radius_km: scanRadius
        }
      })
      .then((res) => {
        const features = res.data.results?.features || res.data.features || [];
        let parsedStations: Station[] = features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          station_code: f.properties.station_code,
          elevation: f.properties.elevation,
          station_type: f.properties.station_type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          latest_observation: f.properties.latest_observation,
          wind_speed: f.properties.latest_observation?.wind_speed !== undefined && f.properties.latest_observation?.wind_speed !== null ? parseFloat(f.properties.latest_observation.wind_speed) : 0,
          wind_dir: f.properties.latest_observation?.wind_dir !== undefined && f.properties.latest_observation?.wind_dir !== null ? parseFloat(f.properties.latest_observation.wind_dir) : 180
        }));

        // Áp dụng bộ lọc tùy chọn tại local
        if (stationTypeFilter) {
          parsedStations = parsedStations.filter(s => s.station_type === stationTypeFilter);
        }
        if (windSpeedFilter) {
          const speedVal = parseFloat(windSpeedFilter);
          parsedStations = parsedStations.filter(s => (s.wind_speed || 0) >= speedVal);
        }

        setStations(parsedStations);
        setMapData(parsedStations); // Đồng bộ hiển thị lên bản đồ
        setHasScanned(true);
        setIsScanning(false);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error spatial query stations:', err);
        setError('Không thể thực hiện quét trạm quan trắc.');
        setIsScanning(false);
        setLoading(false);
      });
    }, 1500);
  };

  const handleClearScan = () => {
    setPickedLocation(null);
    setStations([]);
    setMapData([]);
    setHasScanned(false);
    setStationTypeFilter('');
    setWindSpeedFilter('');
  };

  const handleLocateStation = (station: Station) => {
    setMapCenter([station.lat, station.lon]);
    setMapZoom(12);
    setFocusedId(station.id);
    setSelectedStationId(station.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Khối Điều Khiển Quét Bản Đồ */}
      <div className="co2-card">
        <div className="co2-card-header">
          <h3>
            <i className="fa fa-satellite-dish" style={{ marginRight: '8px', color: 'var(--color-accent-primary)' }}></i>
            Quét Không Gian Trạm Quan Trắc
          </h3>
        </div>
        <div className="co2-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            {/* Tọa độ điểm chọn */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>TỌA ĐỘ TÂM QUÉT</span>
              {pickedLocation ? (
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className="fa fa-map-marker-alt" style={{ color: '#ef4444' }}></i>
                  <span>Vĩ độ: {pickedLocation[0].toFixed(5)}, Kinh độ: {pickedLocation[1].toFixed(5)}</span>
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#f59e0b', fontStyle: 'italic' }}>
                  <i className="fa fa-info-circle"></i> Vui lòng click chọn 1 điểm trên bản đồ bên trái
                </div>
              )}
            </div>

            {/* Slider Bán kính quét */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>BÁN KÍNH QUÉT</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6' }}>{scanRadius} km</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="300" 
                value={scanRadius} 
                onChange={(e) => setScanRadius(parseInt(e.target.value))} 
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Bộ lọc nâng cao bổ sung */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>LOẠI TRẠM</label>
              <select 
                value={stationTypeFilter} 
                onChange={(e) => setStationTypeFilter(e.target.value)} 
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                <option value="">Tất cả loại trạm</option>
                <option value="synop">SYNOP</option>
                <option value="kttv">KTTV</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>TỐC ĐỘ GIÓ TỐI THIỂU</label>
              <select 
                value={windSpeedFilter} 
                onChange={(e) => setWindSpeedFilter(e.target.value)} 
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              >
                <option value="">Tất cả tốc độ</option>
                <option value="5">&gt;= 5 m/s</option>
                <option value="10">&gt;= 10 m/s</option>
                <option value="15">&gt;= 15 m/s</option>
                <option value="20">&gt;= 20 m/s</option>
              </select>
            </div>
          </div>

          {/* Nút hành động */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
            <button 
              onClick={handleScan}
              disabled={!pickedLocation || isScanning}
              style={{
                padding: '8px 24px',
                backgroundColor: pickedLocation ? 'var(--color-accent-primary)' : '#cbd5e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: pickedLocation ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: pickedLocation ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
              }}
            >
              {isScanning ? (
                <>
                  <i className="fa fa-spinner fa-spin"></i> Đang tìm kiếm...
                </>
              ) : (
                <>
                  <i className="fa fa-search"></i> Bắt đầu tìm kiếm trạm
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Khối Kết Quả Bảng Trạm */}
      <div className="co2-card">
        <div className="co2-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Kết quả tìm kiếm ({stations.length} trạm)</h3>
          {hasScanned && (
            <button 
              onClick={handleClearScan} 
              style={{ 
                border: 'none', 
                background: 'transparent', 
                color: '#ef4444', 
                cursor: 'pointer', 
                fontSize: '11px', 
                fontWeight: 600 
              }}
            >
              <i className="fa fa-sync"></i> Thiết lập lại
            </button>
          )}
        </div>

        <div className="co2-card-body" style={{ padding: '0' }}>
          {isScanning || loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)', marginBottom: '10px' }}></i>
              <p>{isScanning ? 'Đang thực hiện quét radar xung quanh tọa độ chọn...' : 'Đang tải dữ liệu trạm...'}</p>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--color-accent-red)', textAlign: 'center', padding: '20px 0' }}>
              <i className="fa fa-exclamation-triangle fa-2x" style={{ marginBottom: '10px' }}></i>
              <p>{error}</p>
            </div>
          ) : !hasScanned ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
              <i className="fa fa-map-marked-alt fa-3x" style={{ marginBottom: '15px', opacity: 0.5 }}></i>
              <p style={{ fontWeight: 600 }}>Chưa thực hiện quét</p>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>Chọn một điểm trên bản đồ bên trái và nhấn nút "Bắt đầu Quét trạm" để xem kết quả.</p>
            </div>
          ) : stations.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
              <i className="fa fa-exclamation-triangle fa-3x" style={{ marginBottom: '15px', color: '#f59e0b', opacity: 0.8 }}></i>
              <p style={{ fontWeight: 600 }}>Không tìm thấy trạm nào thỏa mãn điều kiện</p>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>Hãy thử tăng bán kính quét hoặc thay đổi bộ lọc điều kiện hiển thị.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stations.map((station) => {
                const obs = station.latest_observation;
                return (
                  <div 
                    key={station.id} 
                    style={{ 
                      padding: '12px 15px', 
                      borderBottom: '1px solid var(--color-border)', 
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'background 0.2s',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleLocateStation(station)}
                    className="station-item-row"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-accent-primary)' }}>
                          {station.name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                          ({station.station_code})
                        </span>
                        <span style={{
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          backgroundColor: station.station_type === 'synop' ? '#e0f2fe' : '#fef3c7',
                          color: station.station_type === 'synop' ? '#0369a1' : '#b45309',
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {station.station_type}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <i 
                          className="fa fa-chart-line" 
                          onClick={() => navigate(`/stations/${station.id}`)}
                          style={{ cursor: 'pointer', color: 'var(--color-accent-primary)', fontSize: '15px' }} 
                          title="Xem chi tiết trạm"
                        ></i>
                        <i 
                          className="fa fa-crosshairs" 
                          onClick={() => handleLocateStation(station)}
                          style={{ cursor: 'pointer', color: '#10b981', fontSize: '15px' }} 
                          title="Định vị trên bản đồ"
                        ></i>
                      </div>
                    </div>

                    {/* Chỉ số đo đạc khí tượng mới nhất */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', fontSize: '11px', color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa fa-thermometer-half" style={{ color: '#ef4444' }}></i>
                        <span>Nhiệt độ: <strong>{obs?.temp_2m !== null && obs?.temp_2m !== undefined ? `${obs.temp_2m} °C` : 'N/A'}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa fa-wind" style={{ color: '#3b82f6' }}></i>
                        <span>Gió: <strong>{obs?.wind_speed !== null && obs?.wind_speed !== undefined ? `${obs.wind_speed} m/s` : 'N/A'}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa fa-compass" style={{ color: '#8b5cf6' }}></i>
                        <span>Hướng gió: <strong>{obs?.wind_dir !== null && obs?.wind_dir !== undefined ? `${obs.wind_dir}°` : 'N/A'}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa fa-tint" style={{ color: '#06b6d4' }}></i>
                        <span>Độ ẩm: <strong>{obs?.humidity !== null && obs?.humidity !== undefined ? `${obs.humidity}%` : 'N/A'}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa fa-compress-arrows-alt" style={{ color: '#64748b' }}></i>
                        <span>Khí áp: <strong>{obs?.pressure !== null && obs?.pressure !== undefined ? `${obs.pressure} hPa` : 'N/A'}</strong></span>
                      </div>
                      <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                        <span>Tọa độ: {station.lat.toFixed(4)}, {station.lon.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default StationsPage;
