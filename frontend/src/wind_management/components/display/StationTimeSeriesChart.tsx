import React, { useState, useEffect } from 'react';
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
import { useWindStore } from '../../stores/useWindStore';

// Đăng ký các thành phần của ChartJS
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Observation {
  obs_time: string;
  wind_speed: number | null;
  wind_dir: number | null;
  temp_2m: number | null;
  humidity: number | null;
  pressure: number | null;
  rain_06h: number | null;
  rain_24h: number | null;
}

export const StationTimeSeriesChart: React.FC = () => {
  const { selectedStationId, setSelectedStationId } = useWindStore();
  const [variable, setVariable] = useState<string>('wind_speed');
  
  // Khoảng thời gian mặc định (Tuần đầu tháng 7 năm 2026 dựa theo dữ liệu mẫu của hệ thống)
  const [startTime, setStartTime] = useState<string>('2026-07-01T00:00');
  const [endTime, setEndTime] = useState<string>('2026-07-07T23:59');
  
  const [data, setData] = useState<Observation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedStationId) return;

    setLoading(true);
    setError(null);

    // Chuẩn hóa định dạng thời gian ISO để gửi lên API
    const formattedStart = new Date(startTime).toISOString();
    const formattedEnd = new Date(endTime).toISOString();

    axios.get('/wind/api/v1/observations/', {
      params: {
        station: selectedStationId,
        start_time: formattedStart,
        end_time: formattedEnd,
        page_size: 1000 // Tải nhiều bản ghi để vẽ biểu đồ chi tiết hơn
      }
    })
      .then((res) => {
        // Hỗ trợ cả trường hợp kết quả có phân trang hoặc không phân trang
        const obsList = res.data.results || res.data || [];
        
        // Sắp xếp dữ liệu theo thứ tự thời gian tăng dần
        const sortedData = [...obsList].sort(
          (a, b) => new Date(a.obs_time).getTime() - new Date(b.obs_time).getTime()
        );
        setData(sortedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching observations:', err);
        setError('Không thể lấy dữ liệu đo đạc.');
        setLoading(false);
      });
  }, [selectedStationId, startTime, endTime]);

  if (!selectedStationId) return null;

  // Cấu hình nhãn hiển thị cho các biến quan trắc
  const variablesMap: Record<string, { label: string; unit: string; color: string }> = {
    wind_speed: { label: 'Tốc độ gió', unit: 'm/s', color: '#397aab' },
    wind_dir: { label: 'Hướng gió', unit: '°', color: '#10b981' },
    temp_2m: { label: 'Nhiệt độ (2m)', unit: '°C', color: '#ef4444' },
    humidity: { label: 'Độ ẩm', unit: '%', color: '#3b82f6' },
    pressure: { label: 'Khí áp', unit: 'hPa', color: '#8b5cf6' },
    rain_06h: { label: 'Lượng mưa (6h)', unit: 'mm', color: '#f59e0b' },
  };

  const currentVarInfo = variablesMap[variable] || variablesMap.wind_speed;

  // Chuẩn bị dữ liệu cho biểu đồ Chart.js
  const chartData = {
    labels: data.map((item) => {
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
        data: data.map((item: any) => item[variable]),
        borderColor: currentVarInfo.color,
        backgroundColor: `${currentVarInfo.color}20`,
        borderWidth: 2,
        tension: 0.1,
        pointRadius: data.length > 50 ? 0 : 3, // Ẩn điểm chấm nếu quá nhiều dữ liệu để tránh rối mắt
        pointHoverRadius: 5,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 6,
          font: {
            size: 9,
          },
        },
      },
      y: {
        ticks: {
          font: {
            size: 9,
          },
        },
      },
    },
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '100px',
      right: '20px',
      width: '450px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      padding: '15px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--color-border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Chuỗi thời gian Trạm #{selectedStationId}
        </h4>
        <button 
          onClick={() => setSelectedStationId(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-secondary)' }}
        >
          <i className="fa fa-times"></i>
        </button>
      </div>

      {/* Điều khiển: Chọn biến và thời gian */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', fontSize: '11px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, width: '70px' }}>Yếu tố:</span>
          <select 
            value={variable} 
            onChange={(e) => setVariable(e.target.value)}
            style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '11px' }}
          >
            {Object.entries(variablesMap).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, width: '70px' }}>Từ:</span>
          <input 
            type="datetime-local" 
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ flex: 1, padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '11px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, width: '70px' }}>Đến:</span>
          <input 
            type="datetime-local" 
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ flex: 1, padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '11px' }}
          />
        </div>
      </div>

      {/* Khung vẽ biểu đồ */}
      <div style={{ height: '180px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)', marginBottom: '8px' }}></i>
            <p style={{ margin: 0 }}>Đang tải chuỗi dữ liệu...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: 'var(--color-accent-red)', fontSize: '12px' }}>
            <i className="fa fa-exclamation-triangle" style={{ marginBottom: '6px' }}></i>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            <i className="fa fa-info-circle fa-2x" style={{ color: '#94a3b8', marginBottom: '8px' }}></i>
            <p style={{ margin: 0 }}>Không có dữ liệu đo đạc cho trạm này trong khoảng thời gian đã chọn.</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
};

