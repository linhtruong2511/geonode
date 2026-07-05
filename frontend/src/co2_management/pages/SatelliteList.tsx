import React, { useState } from 'react';
import { useFetchData } from '@common/hooks/useFetchData';

interface Satellite {
  id: number;
  satellite_name: string;
  operator: string;
  launch_date: string;
  is_active: string;
  description: string;
}

const SatelliteList: React.FC = () => {
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const { data, totalCount, loading } = useFetchData<Satellite>('/co2/api/v1/satellites/', {
    page: pageIndex + 1,
    pageSize: pageSize,
  });

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="co2-page-title" style={{ marginBottom: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Danh sách vệ tinh</h3>
          <p style={{ fontSize: '11px', margin: 0 }}>Quản lý thông tin các vệ tinh quan trắc</p>
        </div>
      </div>

      {/* List of Satellites - No Table, No Card */}
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
                <i className="fa fa-info-circle" style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '11px' }} title="Chi tiết"></i>
                <i className="fa fa-edit" style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '11px' }} title="Chỉnh sửa"></i>
                <i className="fa fa-trash" style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '11px' }} title="Xóa"></i>
                <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  ID: {item.id}
                </div>
              </div>
              
              {/* Main Info - Important info larger */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {item.satellite_name}
                </div>
                <div>
                  {item.is_active === 'true' ? (
                    <span style={{ color: '#059669', fontSize: '10px', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 4px', borderRadius: '3px' }}>Hoạt động</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontSize: '10px', fontWeight: 600, backgroundColor: '#fee2e2', padding: '1px 4px', borderRadius: '3px' }}>Ngừng</span>
                  )}
                </div>
              </div>
              
              {/* Sub Info */}
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-building" style={{ fontSize: '10px' }}></i>
                  {item.operator}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-calendar" style={{ fontSize: '10px' }}></i>
                  {item.launch_date ? new Date(item.launch_date).toLocaleDateString('vi-VN') : 'N/A'}
                </div>
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
    </div>
  );
};

export default SatelliteList;
