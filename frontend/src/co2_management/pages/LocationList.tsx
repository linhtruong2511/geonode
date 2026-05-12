import React, { useMemo, useState, useEffect } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
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

const columnHelper = createColumnHelper<MonitoringLocation>();

const LocationList: React.FC = () => {
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const [selectedLocation, setSelectedLocation] = useState<{ id: number; name: string } | null>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const { data, totalCount, loading } = useFetchData<MonitoringLocation>('/co2/api/v1/locations/', {
    page: pageIndex + 1,
    pageSize: pageSize,
  });

  useEffect(() => {
    if (selectedLocation) {
      setChartLoading(true);
      axios.get(`/co2/api/v1/locations/${selectedLocation.id}/timeseries/`)
        .then(res => {
          // Format data for Chart.js
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

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Tên vị trí',
        cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
      }),
      columnHelper.accessor('location_type', {
        header: 'Loại',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('latitude', {
        header: 'Vĩ độ',
        cell: info => info.getValue()?.toFixed(4),
      }),
      columnHelper.accessor('longitude', {
        header: 'Kinh độ',
        cell: info => info.getValue()?.toFixed(4),
      }),
      columnHelper.accessor('radius_km', {
        header: 'Bán kính (km)',
        cell: info => info.getValue(),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Thao tác',
        cell: info => (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setSelectedLocation({ id: info.row.original.id, name: info.row.original.name })}
              className="btn btn-sm btn-outline-info" 
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #0284c7', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', cursor: 'pointer' }}
            >
              <i className="fa fa-line-chart"></i> Biểu đồ
            </button>
            <Link to={`/locations/${info.row.original.id}/edit`} className="btn btn-sm btn-outline-secondary" style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', color: '#0f172a', textDecoration: 'none' }}>
              <i className="fa fa-pencil"></i> Sửa
            </Link>
            <button className="btn btn-sm btn-outline-danger" style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #fee2e2', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}>
              <i className="fa fa-trash"></i> Xóa
            </button>
          </div>
        ),
      }),
    ],
    []
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Quản lý Vị trí giám sát</h3>
          <p>Thiết lập các điểm phát thải, nhà máy hoặc khu vực cần theo dõi CO2</p>
        </div>
        <div>
          <Link to="/locations/new" className="btn btn-md btn-primary" style={{ padding: '8px 16px', background: 'var(--color-accent-primary)', color: '#fff', textDecoration: 'none', borderRadius: '6px', fontWeight: 600 }}>
            <i className="fa fa-plus"></i> Thêm vị trí mới
          </Link>
        </div>
      </div>
      
      <ReactTable
        data={data}
        columns={columns}
        pageCount={pageCount}
        pagination={pagination}
        setPagination={setPagination}
        isLoading={loading}
      />

      {/* Modal Biểu đồ */}
      {selectedLocation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', width: '80%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Chuỗi thời gian XCO2: {selectedLocation.name}</h4>
              <button 
                onClick={() => setSelectedLocation(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            
            {chartLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)' }}></i>
              </div>
            ) : chartData ? (
              <div style={{ height: '400px' }}>
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
                    }
                  }} 
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Không có dữ liệu chuỗi thời gian cho vị trí này.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationList;
