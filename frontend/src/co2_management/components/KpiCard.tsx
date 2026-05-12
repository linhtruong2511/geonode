import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, color }) => {
  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>{title}</div>
        <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
      </div>
      <div style={{ fontSize: '32px', opacity: 0.8 }}>{icon}</div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '20px',
  borderRadius: '12px',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
};
