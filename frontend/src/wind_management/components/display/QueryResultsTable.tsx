import React from 'react';
import { useMapStore } from '@common/stores/useMapStore';

export const QueryResultsTable: React.FC = () => {
  const { mapData } = useMapStore();
  
  if (mapData.length === 0) {
    return <div style={{ padding: '15px', fontSize: '13px', color: '#666' }}>Không có dữ liệu.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>ID</th>
            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Tên Trạm</th>
            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Tốc độ (m/s)</th>
            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Hướng (°)</th>
          </tr>
        </thead>
        <tbody>
          {mapData.slice(0, 100).map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px' }}>{item.id}</td>
              <td style={{ padding: '8px' }}>{item.name || 'N/A'}</td>
              <td style={{ padding: '8px' }}>{item.wind_speed}</td>
              <td style={{ padding: '8px' }}>{item.wind_dir}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {mapData.length > 100 && (
        <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666' }}>
          Hiển thị 100 / {mapData.length} kết quả
        </div>
      )}
    </div>
  );
};
