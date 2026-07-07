import React from 'react';
import { useWindStore } from '../../stores/useWindStore';
import { useMapStore } from '@common/stores/useMapStore';

export const QuerySidebar: React.FC = () => {
  const { 
    selectedVariables, setSelectedVariables, 
    activeGridLayers, toggleGridLayer,
    isSplitView, setIsSplitView,
    leftLayer, setLeftLayer, rightLayer, setRightLayer,
    searchQuery, setSearchQuery,
    timeRange, setTimeRange
  } = useWindStore();
  
  const { isDrawingMode, setIsDrawingMode } = useMapStore();

  const handleVarChange = (v: string) => {
    if (selectedVariables.includes(v)) {
      setSelectedVariables(selectedVariables.filter(x => x !== v));
    } else {
      setSelectedVariables([...selectedVariables, v]);
    }
  };

  return (
    <div style={{ padding: '15px' }}>
      <h3 style={{ marginTop: 0, fontSize: '16px', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
        <i className="fa fa-filter"></i> Bộ lọc & Truy vấn
      </h3>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Tìm kiếm trạm (Tên/Mã)</label>
        <input 
          type="text" 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Nhập tên hoặc mã trạm..."
          style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Khoảng thời gian</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="date" 
            value={timeRange?.[0] || ''}
            onChange={(e) => setTimeRange([e.target.value, timeRange?.[1] || ''])}
            style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          />
          <input 
            type="date" 
            value={timeRange?.[1] || ''}
            onChange={(e) => setTimeRange([timeRange?.[0] || '', e.target.value])}
            style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          />
        </div>
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Biến số quan trắc</label>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <input type="checkbox" checked={selectedVariables.includes('wind_speed')} onChange={() => handleVarChange('wind_speed')} /> Tốc độ gió
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <input type="checkbox" checked={selectedVariables.includes('wind_dir')} onChange={() => handleVarChange('wind_dir')} /> Hướng gió
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <input type="checkbox" checked={selectedVariables.includes('temp')} onChange={() => handleVarChange('temp')} /> Nhiệt độ
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Lớp dữ liệu mô hình (WMS)</label>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <input type="checkbox" checked={activeGridLayers.includes('era5_wind')} onChange={() => toggleGridLayer('era5_wind')} /> ERA5 Wind
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <input type="checkbox" checked={activeGridLayers.includes('wrf_temp')} onChange={() => toggleGridLayer('wrf_temp')} /> WRF Temp
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>So sánh bản đồ (Split View)</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', marginBottom: '5px' }}>
          <input type="checkbox" checked={isSplitView} onChange={(e) => setIsSplitView(e.target.checked)} /> Kích hoạt
        </label>
        {isSplitView && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '10px' }}>
            <select value={leftLayer || ''} onChange={(e) => setLeftLayer(e.target.value)} style={{ fontSize: '12px', padding: '4px' }}>
              <option value="">-- Trái --</option>
              <option value="era5_wind">ERA5 Wind</option>
              <option value="wrf_temp">WRF Temp</option>
            </select>
            <select value={rightLayer || ''} onChange={(e) => setRightLayer(e.target.value)} style={{ fontSize: '12px', padding: '4px' }}>
              <option value="">-- Phải --</option>
              <option value="era5_wind">ERA5 Wind</option>
              <option value="wrf_temp">WRF Temp</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Truy vấn không gian</label>
        <button 
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          style={{ 
            width: '100%', 
            padding: '6px', 
            background: isDrawingMode ? '#e11d48' : '#f1f5f9', 
            color: isDrawingMode ? 'white' : '#333',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          <i className={`fa ${isDrawingMode ? 'fa-times' : 'fa-draw-polygon'}`}></i> {isDrawingMode ? 'Hủy vẽ' : 'Vẽ vùng chọn'}
        </button>
      </div>

    </div>
  );
};
