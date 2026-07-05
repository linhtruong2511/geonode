import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StatisticsData {
  total_filtered: number;
  available_years: number[];
  desc_stats: { avg: number; min: number; max: number; std: number };
  monthly_trend: { labels: string[]; oco2: (number | null)[]; gosat2: (number | null)[] };
  by_source: { source: string; count: number; avg: number; min: number; max: number; std: number }[];
  quality_stats: { total: number; good: number; bad: number; good_pct: number };
  top_months: { month: string; source: string; avg: number; count: number }[];
  spatial_stats: {
    lat_bands: { band: string; count: number; avg: number; max: number }[];
    land_sea: { surface: string; count: number; avg: number }[];
    hotspots: { latitude: number; longitude: number; xco2_ppm: number; measurement_time: string; data_source: string }[];
  };
  quality_detail: { cloudy: number; high_zenith: number; high_uncertainty: number };
  annual_summary: { year: number | string; count: number; avg: number; min: number; max: number; std: number }[];
  distribution: {
    histogram: {
      oco2: { labels: number[]; counts: number[] };
      gosat2: { labels: number[]; counts: number[] };
    };
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  };
}

const Statistics: React.FC = () => {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [filterQuality, setFilterQuality] = useState<string>('all'); // '1' = good only, 'all' = all

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterYear) params.append('year', filterYear);
        if (filterSource) params.append('source', filterSource);
        if (filterQuality === '1') params.append('quality', '1');
        else params.append('quality', '0');

        const res = await axios.get(`/co2/api/v1/statistics/?${params.toString()}`);
        setData(res.data);
      } catch (err: any) {
        setError('Không thể tải dữ liệu thống kê');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filterYear, filterSource, filterQuality]);

  const renderFilters = () => (
    <div className="co2-card" style={{ marginBottom: '20px', padding: '16px' }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: 'var(--color-text-primary)' }}><i className="fa fa-filter"></i> Bộ lọc:</h4>
        
        <select 
          className="form-control" 
          style={{ width: '150px', height: '32px', fontSize: '13px' }}
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
        >
          <option value="">Tất cả các năm</option>
          {data?.available_years?.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select 
          className="form-control" 
          style={{ width: '150px', height: '32px', fontSize: '13px' }}
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="">Tất cả Nguồn</option>
          <option value="OCO2">Chỉ OCO-2</option>
          <option value="GOSAT2">Chỉ GOSAT-2</option>
        </select>

        <select 
          className="form-control" 
          style={{ width: '180px', height: '32px', fontSize: '13px' }}
          value={filterQuality}
          onChange={(e) => setFilterQuality(e.target.value)}
        >
          <option value="all">Tất cả dữ liệu</option>
          <option value="1">Chỉ dữ liệu tốt (Quality=0)</option>
        </select>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <i className="fa fa-spinner fa-spin fa-3x" style={{ color: 'var(--color-accent-primary)' }}></i>
      </div>
    );
  }

  if (error || !data) {
    return <div style={{ color: '#dc2626', padding: '20px' }}>{error || 'Không có dữ liệu'}</div>;
  }

  // --- Section 2: Line Chart ---
  const lineChartData = {
    labels: data.monthly_trend.labels,
    datasets: [
      {
        label: 'OCO-2 (ppm)',
        data: data.monthly_trend.oco2,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'GOSAT-2 (ppm)',
        data: data.monthly_trend.gosat2,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true,
      }
    ]
  };

  // --- Section 4: Bar Chart ---
  const barChartData = {
    labels: data.by_source.map(s => s.source),
    datasets: [{
      label: 'Trung bình XCO2 (ppm)',
      data: data.by_source.map(s => s.avg),
      backgroundColor: ['#3b82f6', '#10b981'],
    }]
  };

  // --- Section 5: Quality Doughnut ---
  const qualityDoughnutData = {
    labels: ['Tốt (Usable)', 'Kém (Flagged)'],
    datasets: [{
      data: [data.quality_stats.good, data.quality_stats.bad],
      backgroundColor: ['#10b981', '#f43f5e'],
      borderWidth: 0
    }]
  };

  // --- Section 6: Annual Bar Chart ---
  const annualChartData = {
    labels: data.annual_summary.map(a => a.year).reverse(),
    datasets: [{
      label: 'Trung bình Năm (ppm)',
      data: data.annual_summary.map(a => a.avg).reverse(),
      backgroundColor: '#8b5cf6',
    }]
  };

  // --- Section 7: Histogram ---
  // Sử dụng labels từ oco2 làm chuẩn hoặc gộp nếu có cả 2.
  const histLabels = data.distribution.histogram.oco2.labels.length > 0 ? 
    data.distribution.histogram.oco2.labels : data.distribution.histogram.gosat2.labels;
  
  const histData = {
    labels: histLabels,
    datasets: [
      {
        label: 'OCO-2',
        data: data.distribution.histogram.oco2.counts,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
      },
      {
        label: 'GOSAT-2',
        data: data.distribution.histogram.gosat2.counts,
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
      }
    ]
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="co2-page-title">
        <div>
          <h3>Thống kê & Phân tích XCO2 Chuyên sâu</h3>
          <p>Hệ thống báo cáo nghiệp vụ phân tích dữ liệu khí nhà kính theo chuẩn khoa học</p>
        </div>
      </div>

      {renderFilters()}
      {loading && <div style={{ color: 'var(--color-accent-primary)', marginBottom: '10px' }}><i className="fa fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>}

      {/* --- BÁO CÁO 1: EXECUTIVE SUMMARY --- */}
      <h4 style={{ marginTop: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>1. Tổng quan Nhanh (Executive Summary)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-kpi-card">
          <div className="kpi-value">{data.desc_stats.avg?.toFixed(2)} ppm</div>
          <div className="kpi-title">Trung bình toàn cục</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value" style={{ color: '#dc2626' }}>{data.desc_stats.max?.toFixed(2)} ppm</div>
          <div className="kpi-title">Mức cực đại (Hotspot)</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value" style={{ color: '#10b981' }}>{data.quality_stats.good_pct}%</div>
          <div className="kpi-title">Tỷ lệ Dữ liệu Tốt</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value">{data.total_filtered.toLocaleString()}</div>
          <div className="kpi-title">Tổng số Điểm đo</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value">±{data.desc_stats.std?.toFixed(2)}</div>
          <div className="kpi-title">Độ lệch chuẩn</div>
        </div>
      </div>

      {/* --- BÁO CÁO 2: XU HƯỚNG THỜI GIAN --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>2. Xu hướng Thời gian (Temporal Trend Analysis)</h4>
      <div className="co2-card" style={{ marginBottom: '30px' }}>
        <div className="co2-card-body" style={{ height: '400px' }}>
          <Line data={lineChartData} options={{ maintainAspectRatio: false, plugins: { title: { display: true, text: 'Xu hướng XCO2 trung bình theo tháng' } } }} />
        </div>
      </div>

      {/* --- BÁO CÁO 3: PHÂN BỐ KHÔNG GIAN --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>3. Phân bố Không gian (Spatial Distribution)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-card">
          <div className="co2-card-header">Theo dải Vĩ độ</div>
          <div className="co2-card-body" style={{ padding: 0 }}>
            <table className="co2-table">
              <thead><tr><th>Vùng (Vĩ độ)</th><th>Số mẫu</th><th>TB (ppm)</th><th>Max (ppm)</th></tr></thead>
              <tbody>
                {data.spatial_stats.lat_bands.map(b => (
                  <tr key={b.band}><td>{b.band}</td><td>{b.count.toLocaleString()}</td><td>{b.avg}</td><td style={{color: '#dc2626'}}>{b.max}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="co2-card">
          <div className="co2-card-header">Theo Bề mặt (Đất/Biển)</div>
          <div className="co2-card-body" style={{ padding: 0 }}>
            <table className="co2-table">
              <thead><tr><th>Loại bề mặt</th><th>Số mẫu</th><th>TB (ppm)</th></tr></thead>
              <tbody>
                {data.spatial_stats.land_sea.map(s => (
                  <tr key={s.surface}><td>{s.surface}</td><td>{s.count.toLocaleString()}</td><td>{s.avg}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="co2-card" style={{ marginBottom: '30px' }}>
        <div className="co2-card-header">Top 10 Hotspots (Vị trí có nồng độ cao nhất)</div>
        <div className="co2-card-body" style={{ padding: 0 }}>
          <table className="co2-table">
            <thead><tr><th>Tọa độ (Lat, Lon)</th><th>XCO2 (ppm)</th><th>Thời gian</th><th>Nguồn</th></tr></thead>
            <tbody>
              {data.spatial_stats.hotspots.map((h, i) => (
                <tr key={i}>
                  <td>{h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</td>
                  <td style={{ fontWeight: 'bold', color: '#dc2626' }}>{h.xco2_ppm}</td>
                  <td>{new Date(h.measurement_time).toLocaleString('vi-VN')}</td>
                  <td>{h.data_source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- BÁO CÁO 4: SO SÁNH VỆ TINH --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>4. So sánh Liên vệ tinh (Cross-Satellite Comparison)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-card">
          <div className="co2-card-body" style={{ padding: 0 }}>
            <table className="co2-table">
              <thead><tr><th>Nguồn</th><th>Số mẫu</th><th>Trung bình</th><th>Min</th><th>Max</th><th>Độ lệch chuẩn</th></tr></thead>
              <tbody>
                {data.by_source.map(s => (
                  <tr key={s.source}>
                    <td style={{ fontWeight: 'bold' }}>{s.source}</td>
                    <td>{s.count.toLocaleString()}</td>
                    <td>{s.avg}</td><td>{s.min}</td><td>{s.max}</td><td>{s.std}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="co2-card">
          <div className="co2-card-body" style={{ height: '250px' }}>
            <Bar data={barChartData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>
      </div>

      {/* --- BÁO CÁO 5: KIỂM SOÁT CHẤT LƯỢNG --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>5. Kiểm soát Chất lượng Dữ liệu (Quality Control)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="co2-card-header" style={{ width: '100%', textAlign: 'center' }}>Tỷ lệ Sử dụng (Usability)</div>
          <div className="co2-card-body" style={{ width: '200px', height: '200px' }}>
            <Doughnut data={qualityDoughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
          </div>
        </div>
        <div className="co2-card">
          <div className="co2-card-header">Phân tích Yếu tố Kém Chất lượng (Cờ cảnh báo)</div>
          <div className="co2-card-body">
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Cảnh báo Mây (Cloudy)</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{data.quality_detail.cloudy.toLocaleString()}</div>
              </div>
              <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Góc mặt trời cao (&gt;70°)</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{data.quality_detail.high_zenith.toLocaleString()}</div>
              </div>
              <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Sai số lớn (&gt;2ppm)</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{data.quality_detail.high_uncertainty.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- BÁO CÁO 6: PHÂN TÍCH THEO NĂM --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>6. Tổng kết theo Năm (Annual Summary)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-card">
          <div className="co2-card-body" style={{ height: '300px' }}>
            <Bar data={annualChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </div>
        <div className="co2-card" style={{ maxHeight: '350px', overflowY: 'auto' }}>
          <div className="co2-card-body" style={{ padding: 0 }}>
            <table className="co2-table">
              <thead><tr><th>Năm</th><th>Số mẫu</th><th>TB (ppm)</th><th>Max (ppm)</th></tr></thead>
              <tbody>
                {data.annual_summary.map(a => (
                  <tr key={a.year}>
                    <td style={{ fontWeight: 'bold' }}>{a.year}</td>
                    <td>{a.count.toLocaleString()}</td>
                    <td>{a.avg}</td>
                    <td>{a.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- BÁO CÁO 7: PHÂN BỐ THỐNG KÊ --- */}
      <h4 style={{ marginTop: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>7. Phân bố Thống kê (Statistical Distribution)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className="co2-card">
          <div className="co2-card-header">Phân bố Tần suất XCO2 (Histogram)</div>
          <div className="co2-card-body" style={{ height: '350px' }}>
            <Bar 
              data={histData} 
              options={{ 
                maintainAspectRatio: false, 
                scales: { x: { stacked: false }, y: { stacked: false } },
                plugins: { tooltip: { mode: 'index' } }
              }} 
            />
          </div>
        </div>
        <div className="co2-card">
          <div className="co2-card-header">Các Mốc Bách phân vị (Percentiles)</div>
          <div className="co2-card-body" style={{ padding: 0 }}>
            <table className="co2-table">
              <tbody>
                <tr><td><strong>P95 (Rất cao)</strong></td><td style={{ color: '#dc2626', fontWeight: 'bold' }}>{data.distribution.percentiles.p95} ppm</td></tr>
                <tr><td><strong>P75 (Cao)</strong></td><td>{data.distribution.percentiles.p75} ppm</td></tr>
                <tr><td><strong>P50 (Trung vị)</strong></td><td>{data.distribution.percentiles.p50} ppm</td></tr>
                <tr><td><strong>P25 (Thấp)</strong></td><td>{data.distribution.percentiles.p25} ppm</td></tr>
                <tr><td><strong>P5 (Rất thấp)</strong></td><td style={{ color: '#059669', fontWeight: 'bold' }}>{data.distribution.percentiles.p5} ppm</td></tr>
              </tbody>
            </table>
            <div style={{ padding: '16px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              * P95 = 5% lượng dữ liệu cao nhất nằm trên mức này. Rất hữu ích để xác định ngưỡng cảnh báo dị thường (outliers).
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Statistics;
