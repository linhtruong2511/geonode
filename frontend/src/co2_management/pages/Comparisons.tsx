import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
import { Scatter, Bar } from 'react-chartjs-2';

interface DataComparison {
  id: number;
  spatial_distance_km: number;
  time_difference_hours: number;
  xco2_difference_ppm: number;
}

const columnHelper = createColumnHelper<DataComparison>();

const Comparisons: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'report' | 'list'>('report');
  
  // List State
  const [{ pageIndex, pageSize }, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const pagination = useMemo(() => ({ pageIndex, pageSize }), [pageIndex, pageSize]);
  const { data: listData, totalCount, loading: listLoading } = useFetchData<DataComparison>('/co2/api/v1/comparisons/', {
    page: pageIndex + 1,
    pageSize: pageSize,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', { header: 'Mã đối chiếu' }),
      columnHelper.accessor('spatial_distance_km', { header: 'Khoảng cách không gian (km)', cell: info => info.getValue()?.toFixed(2) }),
      columnHelper.accessor('time_difference_hours', { header: 'Độ lệch thời gian (giờ)', cell: info => info.getValue()?.toFixed(2) }),
      columnHelper.accessor('xco2_difference_ppm', { header: 'Độ lệch XCO2 (ppm)', cell: info => <span style={{ fontWeight: 600, color: info.getValue() > 0 ? '#dc2626' : '#059669' }}>{info.getValue()?.toFixed(3)}</span> }),
    ],
    []
  );

  // Report State
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'report' && !reportData) {
      const fetchReport = async () => {
        setReportLoading(true);
        try {
          const res = await axios.get('/co2/api/v1/comparisons/report/');
          setReportData(res.data);
        } catch (err) {
          console.error(err);
        } finally {
          setReportLoading(false);
        }
      };
      fetchReport();
    }
  }, [activeTab, reportData]);

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Đối chiếu & Kiểm định chéo (Cross-Validation)</h3>
          <p>Phân tích mức độ tương đồng giữa dữ liệu vệ tinh OCO-2 và GOSAT-2</p>
        </div>
      </div>

      <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '20px' }}>
        <div 
          onClick={() => setActiveTab('report')}
          style={{ padding: '10px 0', borderBottom: activeTab === 'report' ? '2px solid var(--color-accent-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === 'report' ? 600 : 400, color: activeTab === 'report' ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }}
        >
          <i className="fa fa-line-chart"></i> Báo cáo tổng hợp
        </div>
        <div 
          onClick={() => setActiveTab('list')}
          style={{ padding: '10px 0', borderBottom: activeTab === 'list' ? '2px solid var(--color-accent-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === 'list' ? 600 : 400, color: activeTab === 'list' ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }}
        >
          <i className="fa fa-list"></i> Danh sách đối chiếu
        </div>
      </div>

      {activeTab === 'list' && (
        <ReactTable
          data={listData}
          columns={columns}
          pageCount={Math.ceil(totalCount / pageSize)}
          pagination={pagination}
          setPagination={setPagination}
          isLoading={listLoading}
        />
      )}

      {activeTab === 'report' && reportLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <i className="fa fa-spinner fa-spin fa-3x" style={{ color: 'var(--color-accent-primary)' }}></i>
        </div>
      )}

      {activeTab === 'report' && reportData && !reportLoading && !reportData.no_data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div className="co2-kpi-card">
              <div className="kpi-value">{reportData.total_pairs?.toLocaleString() || 0}</div>
              <div className="kpi-title">Tổng số cặp so sánh</div>
            </div>
            <div className="co2-kpi-card">
              <div className="kpi-value">{reportData.bias?.toFixed(3)}</div>
              <div className="kpi-title">Độ lệch trung bình (Bias)</div>
            </div>
            <div className="co2-kpi-card">
              <div className="kpi-value" style={{ color: '#dc2626' }}>{reportData.rmse?.toFixed(3)}</div>
              <div className="kpi-title">Sai số toàn phương (RMSE)</div>
            </div>
            <div className="co2-kpi-card">
              <div className="kpi-value" style={{ color: '#059669' }}>{reportData.corr?.toFixed(3)}</div>
              <div className="kpi-title">Hệ số tương quan (R)</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="co2-card">
              <div className="co2-card-body" style={{ height: '350px' }}>
                <Scatter 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: 'Tương quan OCO-2 và GOSAT-2' } },
                    scales: {
                      x: { title: { display: true, text: 'OCO-2 XCO2 (ppm)' } },
                      y: { title: { display: true, text: 'GOSAT-2 XCO2 (ppm)' } }
                    }
                  }} 
                  data={{
                    datasets: [{
                      label: 'XCO2',
                      data: reportData.scatter_data || [],
                      backgroundColor: 'rgba(59, 130, 246, 0.5)'
                    }]
                  }} 
                />
              </div>
            </div>

            <div className="co2-card">
              <div className="co2-card-body" style={{ height: '350px' }}>
                <Bar 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: 'Phân bố độ lệch (Bias Histogram)' } }
                  }} 
                  data={{
                    labels: reportData.bias_hist?.labels || [],
                    datasets: [{
                      label: 'Tần suất',
                      data: reportData.bias_hist?.counts || [],
                      backgroundColor: '#10b981'
                    }]
                  }} 
                />
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'report' && reportData?.no_data && (
        <div style={{ padding: '20px', color: '#64748b', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
          Chưa có dữ liệu so sánh nào. Vui lòng tạo phiên phân tích.
        </div>
      )}
    </div>
  );
};

export default Comparisons;
