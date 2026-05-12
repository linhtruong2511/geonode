import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { KpiCard } from '../components/KpiCard';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface DashboardData {
  stats: {
    measurements_total: number;
    sources_total: number;
    locations_total: number;
    comparisons_total: number;
    jobs_total: number;
    jobs_running: number;
    avg_xco2: number;
    max_xco2: number;
    min_xco2: number;
    good_quality_pct: number;
  };
  by_source: Array<{ label: string; count: number; avg: number }>;
  monthly_trend: Array<{ month: string; source: string; avg: number; count: number }>;
  jobs_by_status: Array<{ status: string; count: number }>;
  recent_sources: Array<any>;
  recent_jobs: Array<any>;
}

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/co2/api/v1/dashboard/')
      .then(response => {
        setData(response.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching dashboard data:', err);
        setError('Không thể tải dữ liệu bảng điều khiển.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>;
  if (error) return <div style={{ padding: '20px', color: '#ef4444', textAlign: 'center' }}>{error}</div>;
  if (!data) return null;

  const { stats, by_source, monthly_trend } = data;

  // Prepare chart data
  const doughnutData = {
    labels: by_source.map(s => s.label),
    datasets: [{
      data: by_source.map(s => s.count),
      backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'],
      borderWidth: 1,
    }]
  };

  // Group monthly trend by month
  const months = Array.from(new Set(monthly_trend.map(t => t.month))).sort();
  const sources = Array.from(new Set(monthly_trend.map(t => t.source)));
  
  const lineDatasets = sources.map((source, idx) => {
    const color = idx === 0 ? '#6366f1' : '#10b981';
    return {
      label: source,
      data: months.map(m => {
        const point = monthly_trend.find(t => t.month === m && t.source === source);
        return point ? point.avg : null;
      }),
      borderColor: color,
      backgroundColor: color,
      tension: 0.3,
      fill: false,
    };
  });

  const lineData = {
    labels: months,
    datasets: lineDatasets
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
        <KpiCard title="Tổng số điểm đo" value={stats.measurements_total.toLocaleString()} icon="📊" color="#6366f1" />
        <KpiCard title="Nguồn dữ liệu" value={stats.sources_total.toLocaleString()} icon="📁" color="#10b981" />
        <KpiCard title="Vị trí giám sát" value={stats.locations_total.toLocaleString()} icon="📍" color="#f59e0b" />
        <KpiCard title="XCO2 Trung bình" value={`${stats.avg_xco2} ppm`} icon="🌬️" color="#3b82f6" />
        <KpiCard title="Chất lượng tốt" value={`${stats.good_quality_pct}%`} icon="✔️" color="#10b981" />
        <KpiCard title="Job đang chạy" value={stats.jobs_running.toLocaleString()} icon="⚙️" color="#ef4444" />
      </div>

      {/* CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Line Chart */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Xu hướng XCO2 theo tháng</h3>
          <div style={{ height: '300px' }}>
            <Line data={lineData} options={{ maintainAspectRatio: false, scales: { y: { min: 380, max: 430 } } }} />
          </div>
        </div>

        {/* Doughnut Chart */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Phân bố dữ liệu theo nguồn</h3>
          <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '300px' }}>
              <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
      </div>

      {/* TABLES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Recent Sources */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Tệp dữ liệu mới nhất</h3>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>Tên tệp</th>
                <th style={thStyle}>Nguồn</th>
                <th style={thStyle}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_sources.map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>{s.name}</td>
                  <td style={tdStyle}>{s.source_type}</td>
                  <td style={tdStyle}>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Jobs */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Phiên phân tích mới nhất</h3>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>Tên Job</th>
                <th style={thStyle}>Trạng thái</th>
                <th style={thStyle}>Tiến độ</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_jobs.map((j: any) => (
                <tr key={j.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>{j.name || `Job #${j.id}`}</td>
                  <td style={tdStyle}>{j.status}</td>
                  <td style={tdStyle}>{j.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};



const cardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '20px',
  borderRadius: '12px',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: '16px',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '14px',
};

const thStyle: React.CSSProperties = {
  padding: '12px',
  fontWeight: 600,
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '12px',
  color: '#334155',
};

export default Dashboard;
