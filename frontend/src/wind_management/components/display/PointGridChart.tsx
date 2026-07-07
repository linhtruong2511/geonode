import React from 'react';
import { useMapEvents } from 'react-leaflet';
import { useWindStore } from '../../stores/useWindStore';

export const PointGridChart: React.FC = () => {
  const { selectedGridPoint, setSelectedGridPoint } = useWindStore();

  useMapEvents({
    click(e) {
      setSelectedGridPoint(e.latlng);
    }
  });

  if (!selectedGridPoint) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '60px',
      right: '20px',
      width: '300px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
      padding: '15px',
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '13px' }}>Dữ liệu Grid</h4>
        <button 
          onClick={() => setSelectedGridPoint(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#666' }}
        >
          <i className="fa fa-times"></i>
        </button>
      </div>
      <div style={{ fontSize: '12px', marginBottom: '10px' }}>
        <strong>Tọa độ:</strong> {selectedGridPoint.lat.toFixed(4)}, {selectedGridPoint.lng.toFixed(4)}
      </div>
      <div style={{ height: '150px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '12px' }}>
        [Biểu đồ mô hình]
      </div>
    </div>
  );
};
