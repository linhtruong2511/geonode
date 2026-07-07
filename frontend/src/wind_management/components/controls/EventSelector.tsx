import React from 'react';
import { useWindStore } from '../../stores/useWindStore';

export const EventSelector: React.FC = () => {
  const { selectedEventId, setSelectedEventId } = useWindStore();

  const events = [
    { id: 1, name: 'Bão Noru (2022)' },
    { id: 2, name: 'Bão Yagi (2024)' },
    { id: 3, name: 'Không khí lạnh T12/2023' },
  ];

  return (
    <div style={{ marginBottom: '15px' }}>
      <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '5px' }}>Sự kiện khí tượng</label>
      <select 
        value={selectedEventId || ''} 
        onChange={(e) => setSelectedEventId(e.target.value ? parseInt(e.target.value, 10) : null)}
        style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
      >
        <option value="">-- Chọn sự kiện --</option>
        {events.map(ev => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </select>
    </div>
  );
};
