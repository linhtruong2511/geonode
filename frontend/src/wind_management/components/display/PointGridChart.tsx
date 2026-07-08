import React from 'react';
import { useWindStore } from '../../stores/useWindStore';
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

// Đăng ký các thành phần cần thiết cho ChartJS
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

export const PointGridChart: React.FC = () => {
  const { selectedGridPoint, setSelectedGridPoint } = useWindStore();

  if (!selectedGridPoint) return null;

  // Tạo dữ liệu giả lập dự báo thời tiết 24h dựa theo tọa độ (mượt mà và ổn định theo kinh vĩ độ)
  const labels = Array.from({ length: 8 }, (_, i) => `${i * 3}:00`);
  
  // Công thức giả ngẫu nhiên dựa vào tọa độ để sinh đường cong thực tế
  const latFactor = selectedGridPoint.lat || 0;
  const lngFactor = selectedGridPoint.lng || 0;
  const baseValue = Math.abs(Math.sin(latFactor) * 8 + Math.cos(lngFactor) * 4) + 4;
  
  const windData = Array.from({ length: 8 }, (_, i) => {
    const cycle = Math.sin((i / 8) * Math.PI * 2 + latFactor);
    return Math.max(1, parseFloat((baseValue + cycle * 3 + Math.cos(i * lngFactor) * 1.5).toFixed(1)));
  });

  const tempData = Array.from({ length: 8 }, (_, i) => {
    const cycle = Math.sin((i / 8) * Math.PI * 2 - Math.PI / 2); // Thường cao nhất vào giữa ngày
    return Math.max(15, parseFloat((26 + cycle * 5 + Math.sin(latFactor) * 3).toFixed(1)));
  });

  const chartData = {
    labels,
    datasets: [
      {
        fill: true,
        label: 'Tốc độ gió (m/s)',
        data: windData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        yAxisID: 'y'
      },
      {
        fill: false,
        label: 'Nhiệt độ (°C)',
        data: tempData,
        borderColor: '#ef4444',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#ef4444',
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          boxWidth: 10,
          font: { size: 10 }
        }
      },
      tooltip: {
        titleFont: { size: 10 },
        bodyFont: { size: 10 }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 9 } }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Tốc độ gió (m/s)',
          font: { size: 9 }
        },
        ticks: { font: { size: 8 } }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Nhiệt độ (°C)',
          font: { size: 9 }
        },
        ticks: { font: { size: 8 } },
        grid: { drawOnChartArea: false } // chỉ hiện grid cho trục y bên trái
      }
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      width: '320px',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(8px)',
      borderRadius: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      border: '1px solid rgba(226, 232, 240, 0.8)',
      padding: '15px',
      zIndex: 1000,
      transition: 'opacity 0.2s'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', color: '#1e293b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fa fa-chart-area" style={{ color: '#3b82f6' }}></i>
          Dự báo lưới tại Điểm
        </h4>
        <button 
          onClick={() => setSelectedGridPoint(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
        >
          <i className="fa fa-times"></i>
        </button>
      </div>
      
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px' }}>
        <strong>Tọa độ chọn:</strong> {selectedGridPoint.lat.toFixed(4)}°N, {selectedGridPoint.lng.toFixed(4)}°E
      </div>
      
      <div style={{ height: '170px' }}>
        <Line data={chartData} options={chartOptions as any} />
      </div>
    </div>
  );
};
export default PointGridChart;
