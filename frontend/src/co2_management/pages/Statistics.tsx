import React, { useState, useEffect } from 'react';
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
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StatisticsData {
  total_filtered: number;
  desc_stats: {
    avg: number;
    min: number;
    max: number;
    std: number;
  };
  monthly_trend: {
    labels: string[];
    oco2: (number | null)[];
    gosat2: (number | null)[];
  };
  by_source: {
    data_source: string;
    count: number;
    avg: number;
    min: number;
    max: number;
    std: number;
  }[];
}

const Statistics: React.FC = () => {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/co2/api/v1/statistics/');
        setData(res.data);
      } catch (err: any) {
        setError('Không thể tải dữ liệu thống kê');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <i className="fa fa-spinner fa-spin fa-3x" style={{ color: 'var(--color-accent-primary)' }}></i>
      </div>
    );
  }

  if (error || !data) {
    return <div style={{ color: '#dc2626', padding: '20px' }}>{error || 'Không có dữ liệu'}</div>;
  }

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

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Xu hướng XCO2 trung bình theo tháng' }
    },
    scales: {
      y: { min: 380, max: 430 }
    }
  };

  const barChartData = {
    labels: data.by_source.map(s => s.data_source),
    datasets: [
      {
        label: 'Trung bình (ppm)',
        data: data.by_source.map(s => s.avg),
        backgroundColor: ['#3b82f6', '#10b981'],
      }
    ]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Trung bình XCO2 theo nguồn' }
    },
    scales: {
      y: { min: 390 }
    }
  };

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Thống kê & Phân tích XCO2</h3>
          <p>Phân tích chuyên sâu về xu hướng và phân bố nồng độ khí nhà kính</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="co2-kpi-card">
          <div className="kpi-value">{data.desc_stats.avg?.toFixed(2)} ppm</div>
          <div className="kpi-title">Trung bình toàn cục</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value" style={{ color: '#dc2626' }}>{data.desc_stats.max?.toFixed(2)} ppm</div>
          <div className="kpi-title">Giá trị cao nhất</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value" style={{ color: '#059669' }}>{data.desc_stats.min?.toFixed(2)} ppm</div>
          <div className="kpi-title">Giá trị thấp nhất</div>
        </div>
        <div className="co2-kpi-card">
          <div className="kpi-value">±{data.desc_stats.std?.toFixed(2)}</div>
          <div className="kpi-title">Độ lệch chuẩn</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div className="co2-card">
          <div className="co2-card-body" style={{ height: '400px' }}>
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>
        <div className="co2-card">
          <div className="co2-card-body" style={{ height: '400px' }}>
            <Bar data={barChartData} options={barChartOptions} />
          </div>
        </div>
      </div>

      <div className="co2-card" style={{ marginTop: '20px' }}>
        <div className="co2-card-header">
          Chi tiết theo Nguồn dữ liệu
        </div>
        <div className="co2-card-body" style={{ padding: 0 }}>
          <table className="co2-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nguồn</th>
                <th>Số lượng mẫu</th>
                <th>Trung bình (ppm)</th>
                <th>Thấp nhất (ppm)</th>
                <th>Cao nhất (ppm)</th>
                <th>Độ lệch chuẩn</th>
              </tr>
            </thead>
            <tbody>
              {data.by_source.map(source => (
                <tr key={source.data_source}>
                  <td style={{ fontWeight: 600 }}>{source.data_source}</td>
                  <td>{source.count.toLocaleString()}</td>
                  <td>{source.avg?.toFixed(2)}</td>
                  <td>{source.min?.toFixed(2)}</td>
                  <td>{source.max?.toFixed(2)}</td>
                  <td>{source.std?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
