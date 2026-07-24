import React, { useState, useEffect, useMemo } from 'react';
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
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StationDetail {
  id: string;
  code: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status: number;
  created_at?: string;
  measurement_count?: number;
  latest_measurement_at?: string;
  available_pollutants?: string[];
}

interface PollutantStat {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

interface StationStatsResponse {
  station_id: string;
  total_records: number;
  pollutants: Record<string, PollutantStat>;
}

interface StationMeasurementItem {
  id: number;
  measured_at: string;
  pm_1?: number | null;
  pm_2_5?: number | null;
  pm_10?: number | null;
  tsp?: number | null;
  co?: number | null;
  no?: number | null;
  no2?: number | null;
  nox?: number | null;
  so2?: number | null;
  o3?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  wind_speed?: number | null;
  wind_direction?: number | null;
  pressure?: number | null;
}

const variablesMap: Record<string, { label: string; unit: string; color: string }> = {
  pm_2_5: { label: 'Bụi mịn PM2.5', unit: 'µg/m³', color: '#ef4444' },
  pm_10: { label: 'Bụi PM10', unit: 'µg/m³', color: '#f97316' },
  pm_1: { label: 'Bụi PM1.0', unit: 'µg/m³', color: '#f59e0b' },
  co: { label: 'Khí CO', unit: 'mg/m³', color: '#10b981' },
  no2: { label: 'Khí NO2', unit: 'µg/m³', color: '#3b82f6' },
  so2: { label: 'Khí SO2', unit: 'µg/m³', color: '#8b5cf6' },
  o3: { label: 'Khí Ozone (O3)', unit: 'µg/m³', color: '#ec4899' },
  tsp: { label: 'Tổng bụi lơ lửng TSP', unit: 'µg/m³', color: '#64748b' },
  temperature: { label: 'Nhiệt độ', unit: '°C', color: '#e11d48' },
  humidity: { label: 'Độ ẩm', unit: '%', color: '#0284c7' },
  wind_speed: { label: 'Tốc độ gió', unit: 'm/s', color: '#0d9488' }
};

const StationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [station, setStation] = useState<StationDetail | null>(null);
  const [stats, setStats] = useState<StationStatsResponse | null>(null);
  const [measurements, setMeasurements] = useState<StationMeasurementItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [loadingStation, setLoadingStation] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingMeasurements, setLoadingMeasurements] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [variable, setVariable] = useState<string>('pm_2_5');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // 1. Tải thông tin chi tiết trạm
  useEffect(() => {
    if (!id) return;
    setLoadingStation(true);
    setError(null);
    axios.get(`/co2/api/v1/aq-stations/${id}/`)
      .then(res => {
        setStation(res.data);
      })
      .catch(err => {
        console.error("Lỗi tải thông tin trạm:", err);
        setError("Không tìm thấy thông tin trạm quan trắc hoặc có lỗi kết nối.");
      })
      .finally(() => setLoadingStation(false));
  }, [id]);

  // 2. Tải thống kê các chỉ số ô nhiễm (Min, Max, Avg, Count) từ /stats/
  useEffect(() => {
    if (!id) return;
    setLoadingStats(true);
    const params: any = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    axios.get(`/co2/api/v1/aq-stations/${id}/stats/`, { params })
      .then(res => {
        setStats(res.data);
      })
      .catch(err => {
        console.error("Lỗi tải thống kê trạm:", err);
      })
      .finally(() => setLoadingStats(false));
  }, [id, dateFrom, dateTo]);

  // 3. Tải danh sách các điểm đo đạc theo trạm
  useEffect(() => {
    if (!id) return;
    setLoadingMeasurements(true);
    const params: any = {
      page,
      page_size: pageSize,
      ordering: 'measured_at'
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    axios.get(`/co2/api/v1/aq-stations/${id}/measurements/`, { params })
      .then(res => {
        if (res.data.results) {
          setMeasurements(res.data.results);
          setTotalCount(res.data.count || 0);
        } else if (Array.isArray(res.data)) {
          setMeasurements(res.data);
          setTotalCount(res.data.length);
        }
      })
      .catch(err => {
        console.error("Lỗi tải dữ liệu đo đạc:", err);
      })
      .finally(() => setLoadingMeasurements(false));
  }, [id, page, dateFrom, dateTo]);

  const currentVarInfo = variablesMap[variable] || variablesMap.pm_2_5;
  const currentStat = stats?.pollutants?.[variable];

  // Sắp xếp dữ liệu đo đạc tăng dần theo thời gian để vẽ biểu đồ
  const sortedMeasurementsForChart = useMemo(() => {
    return [...measurements].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  }, [measurements]);

  // Chuẩn bị dữ liệu biểu đồ Chart.js
  const chartData = {
    labels: sortedMeasurementsForChart.map(m => {
      const d = new Date(m.measured_at);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }),
    datasets: [
      {
        label: `${currentVarInfo.label} (${currentVarInfo.unit})`,
        data: sortedMeasurementsForChart.map((m: any) => m[variable] ?? null),
        borderColor: currentVarInfo.color,
        backgroundColor: `${currentVarInfo.color}18`,
        fill: true,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: sortedMeasurementsForChart.length > 80 ? 0 : 3,
        pointHoverRadius: 6,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { font: { size: 12, weight: 'bold' as const } }
      },
      tooltip: { mode: 'index' as const, intersect: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
      y: { grid: { color: 'var(--color-border)' } }
    }
  };

  const pageCount = Math.ceil(totalCount / pageSize);

  if (loadingStation) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <i className="fa fa-spinner fa-spin fa-3x" style={{ color: 'var(--color-accent-primary)', marginBottom: '20px' }}></i>
        <p style={{ color: 'var(--color-text-secondary)' }}>Đang tải thông tin chi tiết trạm quan trắc...</p>
      </div>
    );
  }

  if (error || !station) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '30px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <i className="fa fa-exclamation-triangle fa-3x" style={{ color: '#ef4444', marginBottom: '15px' }}></i>
          <h3 style={{ margin: '0 0 10px 0' }}>Đã xảy ra lỗi</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>{error || 'Không tìm thấy thông tin trạm.'}</p>
          <button
            onClick={() => navigate('/stations')}
            style={{ marginTop: '15px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--color-accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            <i className="fa fa-arrow-left" style={{ marginRight: '6px' }}></i> Quay lại danh sách trạm
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px' }}>
      {/* Header điều hướng quay lại (đặt phía trên tên trạm) */}
      <div>
        <button
          onClick={() => navigate('/stations')}
          style={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-text-primary)'
          }}
        >
          <i className="fa fa-arrow-left"></i> Quay lại danh sách
        </button>
      </div>

      {/* Tiêu đề trạm & Trạng thái */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '-10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Trạm: {station.name}
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            Mã trạm: <strong className="font-mono">{station.code || 'N/A'}</strong> | ID: <span className="font-mono">{station.id}</span>
          </span>
        </div>

        <span style={{
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          backgroundColor: station.status === 0 ? '#d1fae5' : '#fef3c7',
          color: station.status === 0 ? '#047857' : '#b45309'
        }}>
          {station.status === 0 ? '● Hoạt động bình thường' : '▲ Bảo trì / Offline'}
        </span>
      </div>

      {/* Grid phía trên: Trái (Thông tin trạm - 1) - Phải (Bộ lọc + KPI + Biểu đồ - 3) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '20px' }}>
        
        {/* Cột trái: Thông tin cơ bản trạm */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa fa-building" style={{ color: 'var(--color-accent-primary)' }}></i> Thông tin trạm quan trắc
            </div>
            <div style={{ padding: '16px', fontSize: '12px', lineHeight: '2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Tên trạm:</span>
                <strong style={{ textAlign: 'right', maxWidth: '60%' }}>{station.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Mã định danh:</span>
                <strong className="font-mono">{station.code || 'N/A'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Địa chỉ:</span>
                <span style={{ textAlign: 'right', maxWidth: '65%' }}>{station.address || 'Chưa cập nhật'}</span>
              </div>
              {station.latitude && station.longitude && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Vĩ độ (Lat):</span>
                    <strong className="font-mono">{Number(station.latitude).toFixed(6)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Kinh độ (Lon):</span>
                    <strong className="font-mono">{Number(station.longitude).toFixed(6)}</strong>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Tổng số bản ghi đo:</span>
                <strong className="font-mono">{station.measurement_count || stats?.total_records || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', paddingTop: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Lần đo gần nhất:</span>
                <span>{station.latest_measurement_at ? new Date(station.latest_measurement_at).toLocaleString('vi-VN') : 'N/A'}</span>
              </div>

              {station.available_pollutants && station.available_pollutants.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                    Chỉ số đo đạc hỗ trợ:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {station.available_pollutants.map((p) => (
                      <span key={p} style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#f1f5f9',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border)',
                        fontWeight: 600
                      }}>
                        {p.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cột phải: Bộ lọc + Biểu đồ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* Bộ lọc thời gian & yếu tố */}
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  Yếu tố ô nhiễm / Đo đạc:
                </label>
                <select
                  value={variable}
                  onChange={(e) => setVariable(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '12px', fontWeight: 600 }}
                >
                  {Object.entries(variablesMap).map(([key, val]) => (
                    <option key={key} value={key}>{val.label} ({val.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  Thời gian từ ngày:
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  Đến ngày:
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '12px' }}
                />
              </div>

              {(dateFrom || dateTo) && (
                <div>
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Thẻ Thống kê Thống kê Nhanh (KPI Cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px 14px', borderLeft: '4px solid #3b82f6' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>TRUNG BÌNH (AVG)</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {loadingStats ? <i className="fa fa-spinner fa-spin"></i> : (currentStat?.avg !== null && currentStat?.avg !== undefined ? `${currentStat.avg} ${currentVarInfo.unit}` : 'N/A')}
              </span>
            </div>

            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px 14px', borderLeft: '4px solid #10b981' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>NHỎ NHẤT (MIN)</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}>
                {loadingStats ? <i className="fa fa-spinner fa-spin"></i> : (currentStat?.min !== null && currentStat?.min !== undefined ? `${currentStat.min} ${currentVarInfo.unit}` : 'N/A')}
              </span>
            </div>

            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px 14px', borderLeft: '4px solid #ef4444' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>LỚN NHẤT (MAX)</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>
                {loadingStats ? <i className="fa fa-spinner fa-spin"></i> : (currentStat?.max !== null && currentStat?.max !== undefined ? `${currentStat.max} ${currentVarInfo.unit}` : 'N/A')}
              </span>
            </div>

            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px 14px', borderLeft: '4px solid #8b5cf6' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>MẪU ĐO ĐẠC</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {loadingStats ? <i className="fa fa-spinner fa-spin"></i> : (currentStat?.count !== undefined ? currentStat.count.toLocaleString() : 'N/A')}
              </span>
            </div>
          </div>

          {/* Biểu đồ Chuỗi Thời gian */}
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Biểu đồ chuỗi số liệu {currentVarInfo.label}
            </h4>
            <div style={{ height: '320px', position: 'relative' }}>
              {loadingMeasurements ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: 'var(--color-text-secondary)' }}>
                  <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)', marginBottom: '10px' }}></i>
                  <p>Đang tải dữ liệu biểu đồ...</p>
                </div>
              ) : sortedMeasurementsForChart.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: 'var(--color-text-secondary)' }}>
                  <i className="fa fa-info-circle fa-2x" style={{ color: '#94a3b8', marginBottom: '10px' }}></i>
                  <p>Không có dữ liệu đo đạc cho chỉ số này trong khoảng thời gian được chọn.</p>
                </div>
              ) : (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Bảng Chi tiết Số liệu Đo đạc (Full Width) */}
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Chi tiết nhật ký số liệu quan trắc ({totalCount} bản ghi)
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            Trang {page} / {pageCount || 1}
          </span>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
          <table className="co2-table" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                <th>Thời gian</th>
                <th>PM2.5 (µg/m³)</th>
                <th>PM10 (µg/m³)</th>
                <th>CO (mg/m³)</th>
                <th>NO2 (µg/m³)</th>
                <th>SO2 (µg/m³)</th>
                <th>O3 (µg/m³)</th>
                <th>Nhiệt độ (°C)</th>
                <th>Độ ẩm (%)</th>
                <th>Tốc độ gió (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {loadingMeasurements ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                    <i className="fa fa-spinner fa-spin"></i> Đang tải dữ liệu nhật ký...
                  </td>
                </tr>
              ) : measurements.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                    Không có nhật ký số liệu đo đạc nào.
                  </td>
                </tr>
              ) : (
                measurements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {new Date(m.measured_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="font-mono" style={{ color: m.pm_2_5 !== null ? '#ef4444' : 'inherit' }}>
                      {m.pm_2_5 !== null && m.pm_2_5 !== undefined ? m.pm_2_5 : '-'}
                    </td>
                    <td className="font-mono" style={{ color: m.pm_10 !== null ? '#f97316' : 'inherit' }}>
                      {m.pm_10 !== null && m.pm_10 !== undefined ? m.pm_10 : '-'}
                    </td>
                    <td className="font-mono" style={{ color: m.co !== null ? '#10b981' : 'inherit' }}>
                      {m.co !== null && m.co !== undefined ? m.co : '-'}
                    </td>
                    <td className="font-mono" style={{ color: m.no2 !== null ? '#3b82f6' : 'inherit' }}>
                      {m.no2 !== null && m.no2 !== undefined ? m.no2 : '-'}
                    </td>
                    <td className="font-mono" style={{ color: m.so2 !== null ? '#8b5cf6' : 'inherit' }}>
                      {m.so2 !== null && m.so2 !== undefined ? m.so2 : '-'}
                    </td>
                    <td className="font-mono" style={{ color: m.o3 !== null ? '#ec4899' : 'inherit' }}>
                      {m.o3 !== null && m.o3 !== undefined ? m.o3 : '-'}
                    </td>
                    <td className="font-mono">
                      {m.temperature !== null && m.temperature !== undefined ? m.temperature : '-'}
                    </td>
                    <td className="font-mono">
                      {m.humidity !== null && m.humidity !== undefined ? m.humidity : '-'}
                    </td>
                    <td className="font-mono">
                      {m.wind_speed !== null && m.wind_speed !== undefined ? m.wind_speed : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page <= 1}
              style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Trang trước
            </button>
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center' }}>
              Trang <strong>{page}</strong> / {pageCount}
            </span>
            <button
              onClick={() => setPage(p => Math.min(p + 1, pageCount))}
              disabled={page >= pageCount}
              style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: page >= pageCount ? 'not-allowed' : 'pointer' }}
            >
              Trang sau
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StationDetailPage;
