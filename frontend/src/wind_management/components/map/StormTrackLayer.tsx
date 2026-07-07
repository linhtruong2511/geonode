import React from 'react';
import { useWindStore } from '../../stores/useWindStore';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';

export const StormTrackLayer: React.FC = () => {
  const { selectedEventId } = useWindStore();

  if (!selectedEventId) return null;

  // Mock data for demonstration. In reality, fetch event details using selectedEventId
  const mockTrack = [
    { lat: 15.5, lng: 110.5, speed: 25, time: '2023-09-01T00:00:00Z' },
    { lat: 16.0, lng: 109.0, speed: 30, time: '2023-09-01T12:00:00Z' },
    { lat: 16.5, lng: 107.5, speed: 28, time: '2023-09-02T00:00:00Z' },
  ];

  return (
    <>
      <Polyline positions={mockTrack.map(p => [p.lat, p.lng])} color="red" weight={3} dashArray="5, 10" />
      {mockTrack.map((point, idx) => (
        <CircleMarker 
          key={idx} 
          center={[point.lat, point.lng]} 
          radius={5} 
          pathOptions={{ fillColor: 'red', color: 'darkred', weight: 1, fillOpacity: 0.8 }}
        >
          <Popup>
            <div style={{ fontSize: '12px' }}>
              <strong>Thời gian:</strong> {new Date(point.time).toLocaleString()}<br />
              <strong>Sức gió:</strong> {point.speed} m/s
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
};
