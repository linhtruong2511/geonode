import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Station {
  id: number;
  station_code: string;
  name: string;
  elevation: string | number | null;
  station_type: string;
  is_active: boolean;
  dataset_code: string;
  geometry?: {
    type: string;
    coordinates: [number, number];
  };
  properties?: {
    latest_observation?: {
      obs_time: string;
      wind_speed: number | null;
      wind_dir: number | null;
      temp_2m: number | null;
      humidity: number | null;
      pressure: number | null;
    };
  };
  latest_observation?: {
    obs_time: string;
    wind_speed: number | null;
    wind_dir: number | null;
    temp_2m: number | null;
    humidity: number | null;
    pressure: number | null;
  };
}

interface Observation {
  id: number;
  obs_time: string;
  wind_speed: number | null;
  wind_dir: number | null;
  temp_2m: number | null;
  humidity: number | null;
  pressure: number | null;
  rain_06h: number | null;
  rain_24h: number | null;
}

interface StationDetailPageProps {
  station?: Station;
}

const StationDetailPage: React.FC<StationDetailPageProps> = ({ station: stationProp }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [station, setStation] = useState<Station | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loadingStation, setLoadingStation] = useState<boolean>(true);
  const [loadingObs, setLoadingObs] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [variable, setVariable] = useState<string>('wind_speed');
  
  // Các bộ lọc thời gian riêng cho từng View Mode để tối ưu trải nghiệm người dùng
  const [viewMode, setViewMode] = useState<'raw' | 'monthly' | 'yearly'>('yearly');
  
  // 1. Raw mode: datetime-local
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  // 2. Monthly mode: input type="month" (YYYY-MM)
  const [startMonth, setStartMonth] = useState<string>('');
  const [endMonth, setEndMonth] = useState<string>('');

  // 3. Yearly mode: select YYYY
  const [startYear, setStartYear] = useState<string>('');
  const [endYear, setEndYear] = useState<string>('');

  const [summaryResults, setSummaryResults] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  const variablesMap: Record<string, { label: string; unit: string; color: string }> = {
    wind_speed: { label: 'Tốc độ gió', unit: 'm/s', color: '#397aab' },
    wind_dir: { label: 'Hướng gió', unit: '°', color: '#10b981' },
    temp_2m: { label: 'Nhiệt độ (2m)', unit: '°C', color: '#ef4444' },
    humidity: { label: 'Độ ẩm', unit: '%', color: '#3b82f6' },
    pressure: { label: 'Khí áp', unit: 'hPa', color: '#8b5cf6' },
    rain_06h: { label: 'Lượng mưa (6h)', unit: 'mm', color: '#f59e0b' },
  };

  // Tạo danh sách năm phục vụ dropdown select
  const currentYear = new Date().getFullYear();
  const yearsList = Array.from({ length: 30 }, (_, i) => (currentYear - i).toString());

  // Chuẩn hóa trạm
  const normalizeStation = (data: any): Station | null => {
    if (!data) return null;
    if (data.properties) {
      return {
        id: data.id || data.properties.id,
        station_code: data.properties.station_code,
        name: data.properties.name,
        elevation: data.properties.elevation,
        station_type: data.properties.station_type,
        is_active: data.properties.is_active,
        dataset_code: data.properties.dataset_code,
        geometry: data.geometry,
        properties: data.properties,
        latest_observation: data.properties.latest_observation,
      };
    }
    const geometry = data.geometry || (data.lon !== undefined && data.lat !== undefined ? {
      type: 'Point',
      coordinates: [Number(data.lon), Number(data.lat)]
    } : undefined);

    return {
      ...data,
      geometry
    };
  };

  useEffect(() => {
    if (stationProp) {
      setStation(normalizeStation(stationProp));
      setLoadingStation(false);
      return;
    }
    if (!id) return;

    setLoadingStation(true);
    setError(null);

    axios.get(`/wind/api/v1/stations/${id}/`)
      .then((res) => {
        setStation(normalizeStation(res.data));
        setLoadingStation(false);
      })
      .catch((err) => {
        console.error('Error fetching station details:', err);
        setError('Không thể tải thông tin trạm quan trắc.');
        setLoadingStation(false);
      });
  }, [id, stationProp]);

  // Tải dữ liệu thô (raw mode)
  useEffect(() => {
    if (!id || viewMode !== 'raw') return;

    setLoadingObs(true);
    const params: any = {
      station: id,
      page_size: 200
    };

    if (startTime) {
      params.start_time = new Date(startTime).toISOString();
    }
    if (endTime) {
      params.end_time = new Date(endTime).toISOString();
    }

    axios.get('/wind/api/v1/observations/', { params })
      .then((res) => {
        const obsList = res.data.results || res.data || [];
        const sortedData = [...obsList].sort(
          (a, b) => new Date(a.obs_time).getTime() - new Date(b.obs_time).getTime()
        );
        setObservations(sortedData);
        setLoadingObs(false);
      })
      .catch((err) => {
        console.error('Error fetching observations:', err);
        setLoadingObs(false);
      });
  }, [id, startTime, endTime, viewMode]);

  // Tải dữ liệu tóm tắt (monthly/yearly mode)
  useEffect(() => {
    if (!id || viewMode === 'raw') return;

    setLoadingSummary(true);
    const endpoint = viewMode === 'monthly' ? 'monthly-summary' : 'yearly-summary';

    const params: any = {};
    if (viewMode === 'monthly') {
      if (startMonth) {
        params.start_date = `${startMonth}-01T00:00:00Z`;
      }
      if (endMonth) {
        // Cuối tháng (quy ước tạm ngày 28 để an toàn hoặc lấy ngày cuối cùng)
        params.end_date = `${endMonth}-28T23:59:59Z`;
      }
    } else if (viewMode === 'yearly') {
      if (startYear) {
        params.start_date = `${startYear}-01-01T00:00:00Z`;
      }
      if (endYear) {
        params.end_date = `${endYear}-12-31T23:59:59Z`;
      }
    }

    axios.get(`/wind/api/v1/stations/${id}/${endpoint}/`, { params })
      .then((res) => {
        setSummaryResults(res.data.results || []);
        setLoadingSummary(false);
      })
      .catch((err) => {
        console.error(`Error fetching ${viewMode} summary:`, err);
        setLoadingSummary(false);
      });
  }, [id, viewMode, startMonth, endMonth, startYear, endYear]);

  if (loadingStation) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <i className="fa fa-spinner fa-spin fa-3x" style={{ color: 'var(--color-accent-primary)', marginBottom: '20px' }}></i>
        <p>Đang tải thông tin chi tiết trạm...</p>
      </div>
    );
  }

  if (error || !station) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div className="co2-card" style={{ maxWidth: '500px', margin: '0 auto', padding: '30px' }}>
          <i className="fa fa-exclamation-triangle fa-3x" style={{ color: 'var(--color-accent-red)', marginBottom: '20px' }}></i>
          <h3>Đã xảy ra lỗi</h3>
          <p>{error || 'Không tìm thấy thông tin trạm.'}</p>
          <button className="btn-primary" onClick={() => navigate('/stations')} style={{ marginTop: '20px', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  const currentVarInfo = variablesMap[variable] || variablesMap.wind_speed;

  // Dữ liệu biểu đồ cho chế độ xem gốc
  const rawChartData = {
    labels: observations.map((item) => {
      const date = new Date(item.obs_time);
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }),
    datasets: [
      {
        label: `${currentVarInfo.label} (${currentVarInfo.unit})`,
        data: observations.map((item: any) => item[variable]),
        borderColor: currentVarInfo.color,
        backgroundColor: `${currentVarInfo.color}15`,
        fill: true,
        borderWidth: 2,
        tension: 0.15,
        pointRadius: observations.length > 80 ? 0 : 4,
        pointHoverRadius: 6,
      },
    ],
  };

  // Dữ liệu biểu đồ cho chế độ xem tháng/năm
  const getSummaryChartData = () => {
    const timeLabel = (item: any) => {
      const timeStr = viewMode === 'monthly' ? item.month : item.year;
      if (!timeStr) return '';
      const date = new Date(timeStr);
      return viewMode === 'monthly' 
        ? date.toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })
        : date.getFullYear().toString();
    };

    return {
      labels: summaryResults.map(timeLabel),
      datasets: [
        {
          label: `Trung bình (Avg)`,
          data: summaryResults.map((item) => item[`${variable}_avg`]),
          borderColor: currentVarInfo.color,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          tension: 0.15,
        },
        {
          label: `Trung vị (Median)`,
          data: summaryResults.map((item) => item[`${variable}_median`]),
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.15,
        },
        {
          label: `Lớn nhất (Max)`,
          data: summaryResults.map((item) => item[`${variable}_max`]),
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.15,
        },
        {
          label: `Nhỏ nhất (Min)`,
          data: summaryResults.map((item) => item[`${variable}_min`]),
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.15,
        }
      ]
    };
  };

  const finalChartData = viewMode === 'raw' ? rawChartData : getSummaryChartData();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 12, weight: 'bold' as const }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 12 }
      },
      y: {
        grid: { color: 'var(--color-border)' }
      }
    }
  };

  const latestObs = station.latest_observation || station.properties?.latest_observation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', padding: '10px' }}>
      {/* Header điều hướng quay lại */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={() => navigate('/stations')}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <i className="fa fa-arrow-left"></i> Quay lại danh sách
        </button>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Thông tin chi tiết trạm quan trắc</h2>
      </div>

      {/* Grid phía trên: Trái (Thông tin trạm) - Phải (Bộ lọc + Biểu đồ) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '25px' }}>
        {/* Cột trái: Thông tin cơ bản trạm */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="co2-card">
            <div className="co2-card-header">
              <h3>Thông tin trạm</h3>
            </div>
            <div className="co2-card-body" style={{ padding: '16px', fontSize: '13px', lineHeight: '2' }}>
              <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Mã trạm: </span>
                <strong style={{ float: 'right' }}>{station.station_code || 'N/A'}</strong>
              </div>
              <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Tên trạm: </span>
                <strong style={{ float: 'right' }}>{station.name || 'N/A'}</strong>
              </div>
              <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Loại trạm: </span>
                <span style={{
                  float: 'right',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: station.station_type?.toLowerCase() === 'synop' ? '#e0f2fe' : '#fef3c7',
                  color: station.station_type?.toLowerCase() === 'synop' ? '#0369a1' : '#b45309',
                  fontWeight: 600
                }}>
                  {station.station_type?.toUpperCase() || 'N/A'}
                </span>
              </div>
              <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Cao độ: </span>
                <strong style={{ float: 'right' }}>{station.elevation ? `${station.elevation}m` : 'N/A'}</strong>
              </div>
              
              {station.geometry?.coordinates && (
                <>
                  <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Kinh độ: </span>
                    <strong className="font-mono" style={{ float: 'right' }}>{Number(station.geometry.coordinates[0]).toFixed(4)}</strong>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Vĩ độ: </span>
                    <strong className="font-mono" style={{ float: 'right' }}>{Number(station.geometry.coordinates[1]).toFixed(4)}</strong>
                  </div>
                </>
              )}

              {latestObs && (
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '8px', backgroundColor: 'var(--color-bg-secondary)', padding: '8px', borderRadius: '4px' }}>
                  <span style={{ fontWeight: 'bold', display: 'block', fontSize: '11px', marginBottom: '4px', color: '#1e3a8a' }}>
                    <i className="fa fa-clock"></i> Đo đạc mới nhất:
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-primary)', lineHeight: '1.6' }}>
                    <strong>Thời gian:</strong> {new Date(latestObs.obs_time).toLocaleString('vi-VN')}<br/>
                    <strong>Gió:</strong> {latestObs.wind_speed ?? 'N/A'} m/s ({latestObs.wind_dir ?? 'N/A'}°)<br/>
                    <strong>Nhiệt độ:</strong> {latestObs.temp_2m ?? 'N/A'} °C<br/>
                    <strong>Độ ẩm:</strong> {latestObs.humidity ?? 'N/A'}%
                  </div>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Dataset ID: </span>
                <strong className="font-mono" style={{ float: 'right' }}>{station.dataset_code || 'N/A'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Cột phải: Bộ lọc thời gian & Biểu đồ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Bộ lọc khoảng thời gian thiết kế nâng cao cho từng View Mode */}
          <div className="co2-card">
            <div className="co2-card-header">
              <h3>Bộ lọc thời gian & yếu tố</h3>
            </div>
            <div className="co2-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', padding: '16px', fontSize: '13px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600 }}>Chế độ hiển thị:</label>
                <select 
                  value={viewMode} 
                  onChange={(e) => setViewMode(e.target.value as any)}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontWeight: 600 }}
                >
                  <option value="yearly">Thống kê theo năm</option>
                  <option value="monthly">Thống kê theo tháng</option>
                  <option value="raw">Dữ liệu gốc</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600 }}>Yếu tố đo đạc:</label>
                <select 
                  value={variable} 
                  onChange={(e) => setVariable(e.target.value)}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                >
                  {Object.entries(variablesMap).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>

              {/* Tùy biến UI cho Start Date dựa trên View Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600 }}>Thời gian từ:</label>
                
                {viewMode === 'raw' && (
                  <input 
                    type="datetime-local" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  />
                )}

                {viewMode === 'monthly' && (
                  <input 
                    type="month" 
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  />
                )}

                {viewMode === 'yearly' && (
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  >
                    <option value="">-- Chọn năm --</option>
                    {yearsList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tùy biến UI cho End Date dựa trên View Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600 }}>Thời gian đến:</label>
                
                {viewMode === 'raw' && (
                  <input 
                    type="datetime-local" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  />
                )}

                {viewMode === 'monthly' && (
                  <input 
                    type="month" 
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  />
                )}

                {viewMode === 'yearly' && (
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  >
                    <option value="">-- Chọn năm --</option>
                    {yearsList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Card Biểu đồ */}
          <div className="co2-card" style={{ flexGrow: 1 }}>
            <div className="co2-card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
              <h3>
                {viewMode === 'raw' && 'Biểu đồ chuỗi số liệu quan trắc'}
                {viewMode === 'monthly' && `Biểu đồ thống kê ${currentVarInfo.label} theo tháng`}
                {viewMode === 'yearly' && `Biểu đồ thống kê ${currentVarInfo.label} theo năm`}
              </h3>
              {(viewMode === 'raw' ? (startTime || endTime) : viewMode === 'monthly' ? (startMonth || endMonth) : (startYear || endYear)) && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>
                  {viewMode === 'raw' && `${startTime ? `Từ ${new Date(startTime).toLocaleDateString('vi-VN')}` : ''} ${endTime ? `đến ${new Date(endTime).toLocaleDateString('vi-VN')}` : ''}`}
                  {viewMode === 'monthly' && `${startMonth ? `Từ ${startMonth}` : ''} ${endMonth ? `đến ${endMonth}` : ''}`}
                  {viewMode === 'yearly' && `${startYear ? `Từ ${startYear}` : ''} ${endYear ? `đến ${endYear}` : ''}`}
                </span>
              )}
            </div>
            <div className="co2-card-body" style={{ height: '350px', position: 'relative' }}>
              {loadingObs || loadingSummary ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: 'var(--color-text-secondary)' }}>
                  <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)', marginBottom: '10px' }}></i>
                  <p>Đang tải chuỗi dữ liệu...</p>
                </div>
              ) : (viewMode === 'raw' ? observations.length === 0 : summaryResults.length === 0) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: 'var(--color-text-secondary)' }}>
                  <i className="fa fa-info-circle fa-3x" style={{ color: '#94a3b8', marginBottom: '15px' }}></i>
                  <p>Không có dữ liệu đo đạc nào trong khoảng thời gian được chọn.</p>
                </div>
              ) : (
                <Line data={finalChartData} options={chartOptions} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Phần bảng số liệu nằm dưới cùng và chiếm toàn bộ chiều rộng (Full Width) */}
      <div className="co2-card" style={{ width: '100%' }}>
        <div className="co2-card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
          <h3>
            {viewMode === 'raw' && `Chi tiết số liệu đo đạc (${observations.length} bản ghi)`}
            {viewMode === 'monthly' && `Thống kê theo tháng (${summaryResults.length} bản ghi)`}
            {viewMode === 'yearly' && `Thống kê theo năm (${summaryResults.length} bản ghi)`}
          </h3>
        </div>
        <div className="co2-card-body">
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {viewMode === 'raw' ? (
              <table className="co2-table">
                <thead>
                  <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                    <th>Thời gian</th>
                    <th>Tốc độ gió (m/s)</th>
                    <th>Hướng gió (°)</th>
                    <th>Nhiệt độ (°C)</th>
                    <th>Độ ẩm (%)</th>
                    <th>Khí áp (hPa)</th>
                    <th>Mưa 6h (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingObs ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>
                        <i className="fa fa-spinner fa-spin"></i> Đang tải bảng số liệu...
                      </td>
                    </tr>
                  ) : observations.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                        Không có dữ liệu hiển thị.
                      </td>
                    </tr>
                  ) : (
                    observations.map((obs) => (
                      <tr key={obs.id}>
                        <td style={{ fontWeight: 500 }}>
                          {new Date(obs.obs_time).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="font-mono">{obs.wind_speed !== null ? `${obs.wind_speed}` : '-'}</td>
                        <td className="font-mono">{obs.wind_dir !== null ? `${obs.wind_dir}` : '-'}</td>
                        <td className="font-mono">{obs.temp_2m !== null ? `${obs.temp_2m}` : '-'}</td>
                        <td className="font-mono">{obs.humidity !== null ? `${obs.humidity.toFixed(0)}` : '-'}</td>
                        <td className="font-mono">{obs.pressure !== null ? `${obs.pressure}` : '-'}</td>
                        <td className="font-mono">{obs.rain_06h !== null ? `${obs.rain_06h}` : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="co2-table">
                <thead>
                  <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                    <th>Thời gian</th>
                    <th>Yếu tố</th>
                    <th>Số lượng mẫu</th>
                    <th>Giá trị nhỏ nhất (Min)</th>
                    <th>Giá trị lớn nhất (Max)</th>
                    <th>Giá trị trung bình (Avg)</th>
                    <th>Giá trị trung vị (Median)</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSummary ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>
                        <i className="fa fa-spinner fa-spin"></i> Đang tải dữ liệu tổng hợp...
                      </td>
                    </tr>
                  ) : summaryResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                        Không có dữ liệu tổng hợp.
                      </td>
                    </tr>
                  ) : (
                    summaryResults.map((item, idx) => {
                      const timeStr = viewMode === 'monthly' ? item.month : item.year;
                      const formattedTime = timeStr 
                        ? (viewMode === 'monthly' 
                           ? new Date(timeStr).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })
                           : new Date(timeStr).getFullYear().toString())
                        : 'N/A';
                      
                      const minVal = item[`${variable}_min`];
                      const maxVal = item[`${variable}_max`];
                      const avgVal = item[`${variable}_avg`];
                      const medVal = item[`${variable}_median`];

                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{formattedTime}</td>
                          <td style={{ fontWeight: 500 }}>{currentVarInfo.label} ({currentVarInfo.unit})</td>
                          <td className="font-mono">{item.total_records}</td>
                          <td className="font-mono text-blue-600">{minVal !== null && minVal !== undefined ? Number(minVal).toFixed(2) : '-'}</td>
                          <td className="font-mono text-red-600">{maxVal !== null && maxVal !== undefined ? Number(maxVal).toFixed(2) : '-'}</td>
                          <td className="font-mono text-gray-800">{avgVal !== null && avgVal !== undefined ? Number(avgVal).toFixed(2) : '-'}</td>
                          <td className="font-mono text-green-600">{medVal !== null && medVal !== undefined ? Number(medVal).toFixed(2) : '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StationDetailPage;
