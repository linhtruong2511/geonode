import React, { useEffect } from "react";
import { useWindStore } from "../stores/useWindStore";

const GridDataPage: React.FC = () => {
  const { activeGridLayers, toggleGridLayer } = useWindStore();

  useEffect(() => {
    // Tự động bật u10m (gió) khi người dùng truy cập trang này
    if (activeGridLayers.length === 0) {
      toggleGridLayer("u10m");
    }
  }, []);

  return (
    <div
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div className="co2-card">
        <div className="co2-card-header">
          <h3>
            <i
              className="fa fa-info-circle"
              style={{ marginRight: "8px", color: "#397aab" }}
            ></i>{" "}
            Hướng dẫn Xem Dữ liệu Lưới
          </h3>
        </div>
        <div
          className="co2-card-body"
          style={{ fontSize: "13px", lineHeight: "1.6", color: "#475569" }}
        >
          <p style={{ marginBottom: "10px" }}>
            Trang này chuyên dùng để trực quan hóa dữ liệu dạng lưới (Gridded
            Data) từ các mô hình dự báo thời tiết tiên tiến như{" "}
            <strong>ERA5, WRF, GFS</strong>, v.v.
          </p>
          <p style={{ marginBottom: "10px" }}>
            <i
              className="fa fa-hand-point-right"
              style={{ marginRight: "6px", color: "#3b82f6" }}
            ></i>
            Sử dụng biểu tượng chọn lớp bản đồ ở góc trên bên phải bản đồ để
            bật/tắt các lớp dữ liệu gió hoặc nhiệt độ.
          </p>
          <p style={{ marginBottom: "10px" }}>
            <i
              className="fa fa-hand-point-right"
              style={{ marginRight: "6px", color: "#3b82f6" }}
            ></i>
            Thao tác trực tiếp trên **Thanh trượt thời gian (Time Slider)** nổi
            ở góc dưới bản đồ để chạy hoạt ảnh thời tiết động theo thời gian,
            tăng/giảm tốc độ hoặc nhảy nhanh tới lịch cụ thể.
          </p>
          <p>
            <i
              className="fa fa-hand-point-right"
              style={{ marginRight: "6px", color: "#3b82f6" }}
            ></i>
            Nhấp chuột vào bất kỳ vị trí nào trên bản đồ để xem biểu đồ dự báo
            xu thế thời tiết 24h chi tiết tại tọa độ đó.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GridDataPage;
