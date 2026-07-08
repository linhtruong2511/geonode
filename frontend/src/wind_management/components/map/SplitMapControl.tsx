import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useWindStore } from '../../stores/useWindStore';

export const SplitMapControl: React.FC = () => {
  const map = useMap();
  const { isSplitView, leftLayer, rightLayer, currentTime } = useWindStore();
  const leftLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const rightLayerRef = useRef<L.TileLayer.WMS | null>(null);

  const [sliderValue, setSliderValue] = useState<number>(50); // phần trăm từ 0 đến 100
  const isDragging = useRef(false);

  // Xử lý tạo và cập nhật các lớp bản đồ WMS
  useEffect(() => {
    if (!isSplitView || (!leftLayer && !rightLayer)) {
      if (leftLayerRef.current) map.removeLayer(leftLayerRef.current);
      if (rightLayerRef.current) map.removeLayer(rightLayerRef.current);
      leftLayerRef.current = null;
      rightLayerRef.current = null;
      return;
    }

    if (leftLayer) {
      if (!leftLayerRef.current) {
        leftLayerRef.current = L.tileLayer.wms('/geoserver/wms', {
          layers: `geonode:${leftLayer}`,
          format: 'image/png',
          transparent: true,
        }).addTo(map);
      } else {
        leftLayerRef.current.setParams({ layers: `geonode:${leftLayer}`, time: currentTime || undefined } as any);
      }
    } else if (leftLayerRef.current) {
      map.removeLayer(leftLayerRef.current);
      leftLayerRef.current = null;
    }

    if (rightLayer) {
      if (!rightLayerRef.current) {
        rightLayerRef.current = L.tileLayer.wms('/geoserver/wms', {
          layers: `geonode:${rightLayer}`,
          format: 'image/png',
          transparent: true,
        }).addTo(map);
      } else {
        rightLayerRef.current.setParams({ layers: `geonode:${rightLayer}`, time: currentTime || undefined } as any);
      }
    } else if (rightLayerRef.current) {
      map.removeLayer(rightLayerRef.current);
      rightLayerRef.current = null;
    }
  }, [isSplitView, leftLayer, rightLayer, currentTime, map]);

  // Cập nhật vùng cắt clip-path cho 2 lớp (Yêu cầu 6.4)
  const updateClips = () => {
    if (!isSplitView) return;
    const size = map.getSize();
    const clipX = size.x * (sliderValue / 100);

    if (leftLayerRef.current) {
      const container = leftLayerRef.current.getContainer ? leftLayerRef.current.getContainer() : (leftLayerRef.current as any)._container;
      if (container) {
        container.style.clip = `rect(0px, ${clipX}px, ${size.y}px, 0px)`;
      }
    }

    if (rightLayerRef.current) {
      const container = rightLayerRef.current.getContainer ? rightLayerRef.current.getContainer() : (rightLayerRef.current as any)._container;
      if (container) {
        container.style.clip = `rect(0px, ${size.x}px, ${size.y}px, ${clipX}px)`;
      }
    }
  };

  // Lắng nghe sự kiện di chuyển/zoom bản đồ để vẽ lại vùng clip
  useEffect(() => {
    updateClips();
    map.on('move', updateClips);
    map.on('resize', updateClips);
    
    // Đảm bảo cập nhật khi load các mảnh tiles mới
    if (leftLayerRef.current) leftLayerRef.current.on('tileload', updateClips);
    if (rightLayerRef.current) rightLayerRef.current.on('tileload', updateClips);

    return () => {
      map.off('move', updateClips);
      map.off('resize', updateClips);
    };
  }, [sliderValue, leftLayer, rightLayer, isSplitView, map]);

  // Kéo thả thanh trượt phân tách
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const mapContainer = map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderValue(percentage);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  if (!isSplitView) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${sliderValue}%`,
        width: '4px',
        backgroundColor: '#3b82f6',
        boxShadow: '0 0 12px rgba(59, 130, 246, 0.8)',
        zIndex: 1000,
        cursor: 'ew-resize',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
      }}
      onMouseDown={handleMouseDown}
    >
      <div 
        style={{
          width: '32px',
          height: '32px',
          backgroundColor: '#3b82f6',
          color: '#fff',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          border: '2px solid #fff',
          fontSize: '12px',
          userSelect: 'none'
        }}
      >
        <i className="fa fa-arrows-alt-h"></i>
      </div>
    </div>
  );
};
export default SplitMapControl;
