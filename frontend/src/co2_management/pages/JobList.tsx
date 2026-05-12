import React, { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
import axios from 'axios';

interface AnalysisJob {
  id: number;
  name: string;
  status: string;
  progress: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  task_id: string | null;
}

const columnHelper = createColumnHelper<AnalysisJob>();

const JobList: React.FC = () => {
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newJob, setNewJob] = useState({
    job_name: '',
    job_type: 'COMPARISON',
    parameters: '{}',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  // We need to trigger a refetch when a job is created.
  // useFetchData doesn't explicitly return a refetch function in the provided snippet,
  // but we can change the fetchParams to trigger it or use standard state.
  // For simplicity, let's just assume we can use standard fetch or just let the user refresh,
  // or we can add a key to useFetchData if we want to force refetch.
  // Let's just add a dummy dependency to fetchParams.
  const [refetchKey, setRefetchKey] = useState(0);

  const { data, totalCount, loading } = useFetchData<AnalysisJob>('/co2/api/v1/jobs/', {
    page: pageIndex + 1,
    pageSize: pageSize,
    _refetch: refetchKey, // Dummy param to trigger refetch
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Tên phiên phân tích',
        cell: info => <span style={{ fontWeight: 600 }}>{info.getValue() || `Job #${info.row.original.id}`}</span>,
      }),
      columnHelper.accessor('created_at', {
        header: 'Ngày tạo',
        cell: info => info.getValue() ? new Date(info.getValue()).toLocaleString('vi-VN') : 'N/A',
      }),
      columnHelper.accessor('status', {
        header: 'Trạng thái',
        cell: info => {
          const status = info.getValue();
          let color = '#64748b';
          let bg = '#f1f5f9';
          if (status === 'COMPLETED' || status === 'SUCCESS') {
            color = '#059669';
            bg = '#d1fae5';
          } else if (status === 'FAILED' || status === 'ERROR') {
            color = '#dc2626';
            bg = '#fee2e2';
          } else if (status === 'PROCESSING' || status === 'RUNNING') {
            color = '#d97706';
            bg = '#fef3c7';
          }
          return (
            <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: bg, color: color, fontSize: '12px', fontWeight: 600 }}>
              {status}
            </span>
          );
        },
      }),
      columnHelper.accessor('progress', {
        header: 'Tiến độ',
        cell: info => (
          <div style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius:9999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${info.getValue()}%`,
                backgroundColor: 'var(--color-accent-primary)',
                height: '8px',
                transition: 'width 0.3s ease'
              }}
            ></div>
          </div>
        ),
      }),
      columnHelper.accessor('error_message', {
        header: 'Ghi chú',
        cell: info => {
          const err = info.getValue();
          return err ? <span style={{ color: '#dc2626', fontSize: '12px' }} title={err}>{err.substring(0, 30)}{err.length > 30 ? '...' : ''}</span> : '-';
        },
      }),
    ],
    []
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(newJob.parameters);
      } catch (err) {
        alert('Tham số JSON không hợp lệ!');
        setIsSubmitting(false);
        return;
      }

      await axios.post('/co2/api/v1/jobs/', {
        job_name: newJob.job_name,
        job_type: newJob.job_type,
        parameters: parsedParams,
      });
      
      setShowCreateModal(false);
      setNewJob({ job_name: '', job_type: 'COMPARISON', parameters: '{}' });
      setRefetchKey(prev => prev + 1); // Trigger refetch
    } catch (err) {
      console.error(err);
      alert('Không thể tạo Job!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Quản lý phiên phân tích</h3>
          <p>Theo dõi và khởi tạo các tác vụ xử lý dữ liệu CO2</p>
        </div>
        <div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn btn-md btn-primary" 
            style={{ padding: '8px 16px', background: 'var(--color-accent-primary)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            <i className="fa fa-plus"></i> Tạo Job mới
          </button>
        </div>
      </div>

      <div className="co2-card">
        <div className="co2-card-body" style={{ padding: 0 }}>
          <ReactTable
            data={data}
            columns={columns}
            pageCount={pageCount}
            pagination={pagination}
            setPagination={setPagination}
            isLoading={loading}
          />
        </div>
      </div>

      {/* Modal Tạo Job */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>Tạo phiên phân tích mới</h4>
              <button 
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateJob}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Tên Job</label>
                <input 
                  type="text" 
                  value={newJob.job_name}
                  onChange={e => setNewJob(prev => ({ ...prev, job_name: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Loại phân tích</label>
                <select 
                  value={newJob.job_type}
                  onChange={e => setNewJob(prev => ({ ...prev, job_type: e.target.value }))}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                >
                  <option value="COMPARISON">Đối chiếu (Comparison)</option>
                  <option value="TREND">Phân tích xu hướng (Trend)</option>
                  <option value="ANOMALY">Phát hiện bất thường (Anomaly)</option>
                  <option value="EXPORT">Xuất dữ liệu (Export)</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Tham số (JSON)</label>
                <textarea 
                  value={newJob.parameters}
                  onChange={e => setNewJob(prev => ({ ...prev, parameters: e.target.value }))}
                  rows={4}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--color-accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  {isSubmitting ? 'Đang tạo...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobList;
