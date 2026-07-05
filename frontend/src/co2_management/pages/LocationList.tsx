import React, { useState, useEffect } from 'react';
import { useFetchData } from '@common/hooks/useFetchData';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend
);

interface MonitoringLocation {
  id: number;
  name: string;
  description: string;
  location_type: string;
  radius_km: number;
  latitude: number;
  longitude: number;
}

const LocationList: React.FC = () => {
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const [selectedLocation, setSelectedLocation] = useState<{ id: number; name: string } | null>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);

  const { data, totalCount, loading } = useFetchData<MonitoringLocation>('/co2/api/v1/locations/', {
    page: pageIndex + 1,
    pageSize: pageSize,
  });

  useEffect(() => {
    if (selectedLocation) {
      setChartLoading(true);
      axios.get(`/co2/api/v1/locations/${selectedLocation.id}/timeseries/`)
        .then(res => {
          const datasets = res.data.datasets.map((ds: any) => ({
            ...ds,
            tension: 0.1,
            fill: false,
          }));
          
          setChartData({
            datasets: datasets
          });
        })
        .catch(err => console.error(err))
        .finally(() => setChartLoading(false));
    } else {
      setChartData(null);
    }
  }, [selectedLocation]);

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="co2-page-title" style={{ marginBottom: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Quản lý Vị trí giám sát</h3>
          <p style={{ fontSize: '11px', margin: 0 }}>Thiết lập các điểm phát thải, nhà máy hoặc khu vực cần theo dõi CO2</p>
        </div>
        <div>
          <Link to="/locations/new" style={{ padding: '4px 10px', background: 'var(--color-accent-primary)', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '11px' }}>
            <i className="fa fa-plus"></i> Thêm mới
          </Link>
        </div>
      </div>

      {/* List of Locations - No Table, No Card */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
        {loading ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Đang tải...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Không có dữ liệu</div>
        ) : (
          data.map((item) => (
            <div key={item.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: '#fff' }}>
              {/* Tools on top of row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '2px', alignItems: 'center' }}>
                <input type="checkbox" style={{ margin: 0 }} />
                <i className="fa fa-line-chart" style={{ cursor: 'pointer', color: '#0369a1', fontSize: '11px' }} title="Biểu đồ" onClick={() => setSelectedLocation({ id: item.id, name: item.name })}></i>
                <Link to={`/locations/${item.id}/edit`} style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }} title="Sửa">
                  <i className="fa fa-pencil"></i>
                </Link>
                <i className="fa fa-trash" style={{ cursor: 'pointer', color: '#dc2626', fontSize: '11px' }} title="Xóa"></i>
                <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  {item.location_type}
                </div>
              </div>
              
              {/* Main Info - Important info larger */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  Bán kính: <strong>{item.radius_km}</strong> km
                </div>
              </div>
              
              {/* Sub Info */}
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-map-marker" style={{ fontSize: '10px' }}></i>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </div>
                {item.description && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <i className="fa fa-info-circle" style={{ fontSize: '10px' }}></i>
                    {item.description}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Control */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px' }}>
        <div>
          Tổng số: <strong>{totalCount}</strong>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex - 1 }))}
            disabled={pageIndex === 0}
            style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid var(--color-border)', backgroundColor: pageIndex === 0 ? '#f1f5f9' : '#fff', cursor: pageIndex === 0 ? 'not-allowed' : 'pointer' }}
          >
            Trước
          </button>
          <span>{pageIndex + 1} / {pageCount || 1}</span>
          <button 
            onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
            disabled={pageIndex >= pageCount - 1}
            style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid var(--color-border)', backgroundColor: pageIndex >= pageCount - 1 ? '#f1f5f9' : '#fff', cursor: pageIndex >= pageCount - 1 ? 'not-allowed' : 'pointer' }}
          >
            Sau
          </button>
        </div>
      </div>

      {/* Modal Biểu đồ */}
      {selectedLocation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '6px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14px' }}>Chuỗi thời gian XCO2: {selectedLocation.name}</h4>
              <button 
                onClick={() => setSelectedLocation(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            
            {chartLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <i className="fa fa-spinner fa-spin fa-lg" style={{ color: 'var(--color-accent-primary)' }}></i>
              </div>
            ) : chartData ? (
              <div style={{ height: '300px' }}>
                <Line 
                  data={chartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: {
                        type: 'category',
                        title: { display: true, text: 'Thời gian' }
                      },
                      y: {
                        title: { display: true, text: 'XCO2 (ppm)' }
                      }
                    },
                    plugins: {
                      legend: { labels: { font: { size: 10 } } }
                    }
                  }} 
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '15px', color: '#64748b', fontSize: '12px' }}>Không có dữ liệu chuỗi thời gian cho vị trí này.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationList;
