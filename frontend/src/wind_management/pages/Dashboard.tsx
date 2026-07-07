import React from 'react';
import { EventSelector } from '../components/controls/EventSelector';
import { QuerySidebar } from '../components/controls/QuerySidebar';

const Dashboard: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="co2-card">
        <div className="co2-card-header">
          <h3>Điều khiển Bản đồ & Truy vấn</h3>
        </div>
        <div className="co2-card-body" style={{ padding: 0 }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
            <EventSelector />
          </div>
          <QuerySidebar />
        </div>
      </div>

      <div className="co2-card">
        <div className="co2-card-header">
          <h3>Thống kê Nhanh</h3>
        </div>
        <div className="co2-card-body">
          <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8', fontSize: '13px' }}>
            <li><strong>Tổng số trạm:</strong> 172</li>
            <li><strong>Lượt quan trắc:</strong> 13.0M+</li>
            <li><strong>Bản ghi lưới (Grid):</strong> 7,001</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
