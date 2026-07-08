import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useWindStore } from '../../stores/useWindStore';

export const LayerControlPanel: React.FC = () => {
  const { 
    activeGridLayers, toggleGridLayer, 
    showStations, setShowStations,
    gridOpacity, setGridOpacity 
  } = useWindStore();
  const [datasets, setDatasets] = useState<any[]>([]);

  useEffect(() => {
    axios.get('/wind/api/v1/datasets/?category=GRIDDED')
      .then(res => setDatasets(res.data.results || res.data))
      .catch(err => console.error("Failed to fetch datasets", err));
  }, []);

  return (
    <div className="panel panel-default" style={{
      width: '100%', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    }}>
      <div className="panel-heading" style={{ fontWeight: 'bold' }}>Điều khiển Lớp bản đồ</div>
      <div className="panel-body" style={{ padding: '10px' }}>
        {/* Lớp trạm */}
        <div className="checkbox">
          <label style={{ fontWeight: 'bold' }}>
            <input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} />
            Trạm quan trắc (A2)
          </label>
        </div>
        <hr style={{ margin: '10px 0' }} />
        {/* Lớp lưới */}
        <label style={{ fontWeight: 'bold' }}>Dữ liệu lưới (A1)</label>
        <div className="radio">
          <label>
            <input type="radio" name="gridDataset" checked={activeGridLayers.length === 0} onChange={() => {
              // Clear active grid layers
              activeGridLayers.forEach(l => toggleGridLayer(l));
            }} />
            <em>Không hiển thị</em>
          </label>
        </div>
        {datasets.map(ds => (
          <div className="radio" key={ds.id}>
            <label>
              <input type="radio" name="gridDataset" 
                checked={activeGridLayers.includes(ds.code)} 
                onChange={() => {
                  activeGridLayers.forEach(l => toggleGridLayer(l));
                  toggleGridLayer(ds.code);
                }} 
              />
              {ds.name}
            </label>
          </div>
        ))}
        {/* Lớp dữ liệu tĩnh (ERA5) */}
        {['u10m', 'v10m', 'u100m', 'v100m'].map(layerCode => (
          <div className="radio" key={layerCode}>
            <label>
              <input type="radio" name="gridDataset" 
                checked={activeGridLayers.includes(layerCode)} 
                onChange={() => {
                  activeGridLayers.forEach(l => toggleGridLayer(l));
                  toggleGridLayer(layerCode);
                }} 
              />
              ERA5 Wind: {layerCode}
            </label>
          </div>
        ))}
        {activeGridLayers.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '11px' }}>Độ trong suốt: {Math.round(gridOpacity * 100)}%</label>
            <input type="range" min="0.1" max="1" step="0.1" value={gridOpacity} onChange={(e) => setGridOpacity(parseFloat(e.target.value))} />
          </div>
        )}
      </div>
    </div>
  );
};
