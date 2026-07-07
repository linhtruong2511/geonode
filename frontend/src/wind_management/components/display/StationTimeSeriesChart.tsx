import React, { useState } from 'react';
import { useWindStore } from '../../stores/useWindStore';

export const StationTimeSeriesChart: React.FC = () => {
  const { selectedStationId, setSelectedStationId } = useWindStore();
  const [compareWithModel, setCompareWithModel] = useState(false);

  if (!selectedStationId) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '100px',
      right: '20px',
      width: '400px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
      padding: '15px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '14px' }}>Biểu đồ chuỗi thời gian (Trạm {selectedStationId})</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={compareWithModel} 
              onChange={(e) => setCompareWithModel(e.target.checked)} 
            />
            So sánh mô hình
          </label>
          <button 
            onClick={() => setSelectedStationId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#666' }}
          >
            <i className="fa fa-times"></i>
          </button>
        </div>
      </div>
      <div style={{ height: '200px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '12px', flexDirection: 'column' }}>
        {/* Placeholder for Recharts / Chart.js */}
        <div>[Biểu đồ Recharts sẽ hiển thị tại đây]</div>
        {compareWithModel && (
          <div style={{ marginTop: '10px', color: '#0369a1', fontWeight: 600 }}>
            [Đã tích hợp dữ liệu mô hình WMS/Grid]
          </div>
        )}
      </div>
    </div>
  );
};
