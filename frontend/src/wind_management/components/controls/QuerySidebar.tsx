import React, { useState } from 'react';
import { useWindStore } from '../../stores/useWindStore';
import { useMapStore } from '@common/stores/useMapStore';

export const QuerySidebar: React.FC = () => {
  const { 
    selectedVariables, setSelectedVariables, 
    activeGridLayers, toggleGridLayer,
    isSplitView, setIsSplitView,
    leftLayer, setLeftLayer, rightLayer, setRightLayer,
    searchQuery, setSearchQuery,
    timeRange, setTimeRange,
    gridOpacity, setGridOpacity
  } = useWindStore();
  
  const { isDrawingMode, setIsDrawingMode } = useMapStore();

  // Quản lý trạng thái đóng mở accordion
  const [openSections, setOpenSections] = useState({
    stationSearch: true,
    timeRange: false,
    variables: true,
    wmsLayers: true,
    compareMap: true,
    spatialQuery: false
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleVarChange = (v: string) => {
    if (selectedVariables.includes(v)) {
      setSelectedVariables(selectedVariables.filter(x => x !== v));
    } else {
      setSelectedVariables([...selectedVariables, v]);
    }
  };

  // Kiểu dáng accordion header chung
  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    color: '#334155',
    marginBottom: '6px',
    userSelect: 'none' as const,
    transition: 'background-color 0.2s'
  };

  const bodyStyle = {
    padding: '10px 12px 15px 12px',
    borderLeft: '2px solid #397aab',
    marginLeft: '6px',
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  };

  return (
    <div style={{ padding: '15px' }}>
      <h3 style={{ marginTop: 0, fontSize: '15px', borderBottom: '2px solid #397aab', paddingBottom: '8px', color: '#397aab', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="fa fa-sliders-h"></i> BẢNG ĐIỀU KHIỂN & TRUY VẤN
      </h3>

      {/* Accordion 1: Tìm kiếm trạm */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('stationSearch')}>
          <span><i className="fa fa-broadcast-tower" style={{ marginRight: '8px', color: '#397aab' }}></i> Tìm kiếm trạm</span>
          <i className={`fa ${openSections.stationSearch ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.stationSearch && (
          <div style={bodyStyle}>
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nhập tên hoặc mã trạm..."
              style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
        )}
      </div>

      {/* Accordion 2: Khoảng thời gian */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('timeRange')}>
          <span><i className="fa fa-calendar-alt" style={{ marginRight: '8px', color: '#397aab' }}></i> Khoảng thời gian</span>
          <i className={`fa ${openSections.timeRange ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.timeRange && (
          <div style={bodyStyle}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>TỪ NGÀY</span>
                <input 
                  type="date" 
                  value={timeRange?.[0] || ''}
                  onChange={(e) => setTimeRange([e.target.value, timeRange?.[1] || ''])}
                  style={{ width: '100%', padding: '5px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>ĐẾN NGÀY</span>
                <input 
                  type="date" 
                  value={timeRange?.[1] || ''}
                  onChange={(e) => setTimeRange([timeRange?.[0] || '', e.target.value])}
                  style={{ width: '100%', padding: '5px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Accordion 3: Biến số quan trắc */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('variables')}>
          <span><i className="fa fa-chart-bar" style={{ marginRight: '8px', color: '#397aab' }}></i> Biến số quan trắc</span>
          <i className={`fa ${openSections.variables ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.variables && (
          <div style={bodyStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedVariables.includes('wind_speed')} onChange={() => handleVarChange('wind_speed')} />
              <span>Tốc độ gió</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedVariables.includes('wind_dir')} onChange={() => handleVarChange('wind_dir')} />
              <span>Hướng gió</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedVariables.includes('temp')} onChange={() => handleVarChange('temp')} />
              <span>Nhiệt độ</span>
            </label>
          </div>
        )}
      </div>

      {/* Accordion 4: Lớp dữ liệu mô hình WMS */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('wmsLayers')}>
          <span><i className="fa fa-layer-group" style={{ marginRight: '8px', color: '#397aab' }}></i> Dữ liệu lưới WMS</span>
          <i className={`fa ${openSections.wmsLayers ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.wmsLayers && (
          <div style={bodyStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={activeGridLayers.includes('era5_wind')} onChange={() => toggleGridLayer('era5_wind')} />
              <span>Lớp gió ERA5 (Lưới)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={activeGridLayers.includes('wrf_temp')} onChange={() => toggleGridLayer('wrf_temp')} />
              <span>Lớp nhiệt WRF (Lưới)</span>
            </label>

            {/* Điều chỉnh độ mờ - Opacity slider (Yêu cầu 6.1) */}
            {activeGridLayers.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                  <span>ĐỘ MỜ LỚP LƯỚI</span>
                  <span>{Math.round(gridOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.1"
                  value={gridOpacity} 
                  onChange={(e) => setGridOpacity(parseFloat(e.target.value))} 
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accordion 5: So sánh Swipe Layer */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('compareMap')}>
          <span><i className="fa fa-columns" style={{ marginRight: '8px', color: '#397aab' }}></i> So sánh lớp Swipe</span>
          <i className={`fa ${openSections.compareMap ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.compareMap && (
          <div style={bodyStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isSplitView} onChange={(e) => setIsSplitView(e.target.checked)} />
              <span>Kích hoạt thanh trượt Swipe</span>
            </label>
            {isSplitView && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '5px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>LỚP TRÁI</span>
                  <select value={leftLayer || ''} onChange={(e) => setLeftLayer(e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <option value="">-- Chọn lớp --</option>
                    <option value="era5_wind">Lớp gió ERA5</option>
                    <option value="wrf_temp">Lớp nhiệt WRF</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>LỚP PHẢI</span>
                  <select value={rightLayer || ''} onChange={(e) => setRightLayer(e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <option value="">-- Chọn lớp --</option>
                    <option value="era5_wind">Lớp gió ERA5</option>
                    <option value="wrf_temp">Lớp nhiệt WRF</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accordion 6: Truy vấn không gian */}
      <div>
        <div style={headerStyle} onClick={() => toggleSection('spatialQuery')}>
          <span><i className="fa fa-draw-polygon" style={{ marginRight: '8px', color: '#397aab' }}></i> Khoanh vùng không gian</span>
          <i className={`fa ${openSections.spatialQuery ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '11px', color: '#64748b' }}></i>
        </div>
        {openSections.spatialQuery && (
          <div style={bodyStyle}>
            <button 
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              style={{ 
                width: '100%', 
                padding: '6px 12px', 
                background: isDrawingMode ? '#ef4444' : '#f1f5f9', 
                color: isDrawingMode ? 'white' : '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <i className={`fa ${isDrawingMode ? 'fa-times' : 'fa-pencil-alt'}`}></i> 
              {isDrawingMode ? 'Hủy vẽ vùng' : 'Vẽ vùng chọn trên bản đồ'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
