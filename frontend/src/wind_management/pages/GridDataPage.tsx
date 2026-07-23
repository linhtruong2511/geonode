import React from "react";
import { useGridDataPage } from "../hooks/useGridDataPage";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateStr;
  }
};

const GridDataPage: React.FC = () => {
  const {
    summary, datasetsList, loading, error, variableCombos,
    activeGridLayers, selectedDatasetId,
    selectedYear, selectedMonth, selectedDay, selectedHour,
    availableYears, availableMonths, availableDays, availableHours,
    setSelectedDatasetId, setActiveGridLayers, setSelectedHour,
    handleYearChange, handleMonthChange, handleDayChange,
  } = useGridDataPage();

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDatasetId(e.target.value);
  };

  const handleYearChangeEv = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleYearChange(e.target.value);
  };

  const handleMonthChangeEv = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleMonthChange(e.target.value);
  };

  const handleDayChangeEv = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleDayChange(e.target.value);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedHour(e.target.value);
  };

  return (
    <div
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Time & Dataset Selector Panel */}
      <div className="co2-card" style={{ margin: 0 }}>
        <div className="co2-card-header" style={{ borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <i className="fa fa-sliders-h" style={{ color: "#3b82f6" }}></i>
            Bộ chọn dữ liệu & thời gian (Vịnh Bắc Bộ)
          </h3>
        </div>
        <div className="co2-card-body" style={{ padding: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "20px",
            }}
          >
            {/* Dataset Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn bộ dữ liệu:
              </label>
              <select
                value={selectedDatasetId || ""}
                onChange={handleDatasetChange}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: "pointer",
                }}
              >
                {datasetsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Year Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn năm:
              </label>
              <select
                value={selectedYear}
                onChange={handleYearChangeEv}
                disabled={availableYears.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: availableYears.length === 0 ? "#f1f5f9" : "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: availableYears.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {availableYears.length === 0 ? (
                  <option value="">N/A</option>
                ) : (
                  availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Month Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn tháng:
              </label>
              <select
                value={selectedMonth}
                onChange={handleMonthChangeEv}
                disabled={availableMonths.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: availableMonths.length === 0 ? "#f1f5f9" : "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: availableMonths.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {availableMonths.length === 0 ? (
                  <option value="">N/A</option>
                ) : (
                  availableMonths.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Day Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn ngày:
              </label>
              <select
                value={selectedDay}
                onChange={handleDayChangeEv}
                disabled={availableDays.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: availableDays.length === 0 ? "#f1f5f9" : "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: availableDays.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {availableDays.length === 0 ? (
                  <option value="">N/A</option>
                ) : (
                  availableDays.map((d) => (
                    <option key={d} value={d}>
                      Ngày {d}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Hour Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn giờ (UTC):
              </label>
              <select
                value={selectedHour}
                onChange={handleHourChange}
                disabled={availableHours.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: availableHours.length === 0 ? "#f1f5f9" : "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: availableHours.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {availableHours.length === 0 ? (
                  <option value="">N/A</option>
                ) : (
                  availableHours.map((hr) => (
                    <option key={hr} value={hr}>
                      {hr}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Variable Dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
                Chọn lớp dữ liệu hiển thị:
              </label>
              <select
                value={(() => {
                  if (activeGridLayers.length === 0) return "";
                  const match = variableCombos.find((c: { value: string; label: string }) => {
                    const parts = c.value.split(",");
                    return parts.every((p: string) => activeGridLayers.includes(p));
                  });
                  return match ? match.value : activeGridLayers[0];
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setActiveGridLayers(val.split(","));
                  } else {
                    setActiveGridLayers([]);
                  }
                }}
                disabled={variableCombos.length === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: variableCombos.length === 0 ? "#f1f5f9" : "#fff",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: variableCombos.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {variableCombos.length === 0 ? (
                  <option value="">Không có lớp dữ liệu nào</option>
                ) : (
                  variableCombos.map((c: { value: string; label: string }) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          className="co2-card"
          style={{ padding: "40px", textAlign: "center" }}
        >
          <i
            className="fa fa-spinner fa-spin fa-3x"
            style={{ color: "#3b82f6", marginBottom: "15px" }}
          ></i>
          <p style={{ color: "#64748b", fontWeight: 600 }}>
            Đang tải dữ liệu tổng quan lưới...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          className="co2-card"
          style={{ padding: "30px", textAlign: "center" }}
        >
          <i
            className="fa fa-exclamation-triangle fa-3x"
            style={{ color: "#ef4444", marginBottom: "15px" }}
          ></i>
          <p style={{ color: "#ef4444", fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* Summary Content */}
      {summary && !loading && !error && (
        <>
          {/* KPI Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {/* KPI 1: Total Granules */}
            <div className="co2-card" style={{ margin: 0 }}>
              <div
                className="co2-card-body"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    backgroundColor: "#eff6ff",
                    borderRadius: "50%",
                    width: "50px",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i
                    className="fa fa-file-archive"
                    style={{ fontSize: "22px", color: "#3b82f6" }}
                  ></i>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    Tổng số tệp tin
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: 700,
                      color: "#1e293b",
                      marginTop: "4px",
                    }}
                  >
                    {(summary.total_granules ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 2: Date Range */}
            <div className="co2-card" style={{ margin: 0 }}>
              <div
                className="co2-card-body"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    backgroundColor: "#ecfdf5",
                    borderRadius: "50%",
                    width: "50px",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i
                    className="fa fa-calendar-alt"
                    style={{ fontSize: "22px", color: "#10b981" }}
                  ></i>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    Khoảng thời gian
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#1e293b",
                      marginTop: "4px",
                    }}
                  >
                    {formatDate(summary.min_granule_time)} -{" "}
                    {formatDate(summary.max_granule_time)}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 3: Unique Variables */}
            <div className="co2-card" style={{ margin: 0 }}>
              <div
                className="co2-card-body"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    backgroundColor: "#fffbeb",
                    borderRadius: "50%",
                    width: "50px",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <i
                    className="fa fa-tags"
                    style={{ fontSize: "22px", color: "#f59e0b" }}
                  ></i>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    Số lượng biến số
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: 700,
                      color: "#1e293b",
                      marginTop: "4px",
                    }}
                  >
                    {(summary.unique_variable_codes ?? []).length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Details & Variables Table */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "20px",
            }}
          >
            {/* Datasets Table */}
            <div className="co2-card" style={{ margin: 0 }}>
              <div className="co2-card-header">
                <h3>
                  <i
                    className="fa fa-database"
                    style={{ marginRight: "8px", color: "#3b82f6" }}
                  ></i>
                  Phân bố theo bộ dữ liệu
                </h3>
              </div>
              <div className="co2-card-body" style={{ padding: "0" }}>
                {!summary.datasets || summary.datasets.length === 0 ? (
                  <p
                    style={{
                      padding: "20px",
                      color: "#64748b",
                      textAlign: "center",
                    }}
                  >
                    Không có bộ dữ liệu nào
                  </p>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <th
                          style={{
                            textAlign: "left",
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          Mã bộ dữ liệu
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          Tên bộ dữ liệu
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          Số lượng file
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.datasets ?? []).map((ds, index) => (
                        <tr
                          key={ds.dataset_code}
                          style={{
                            borderBottom:
                              index === (summary.datasets ?? []).length - 1
                                ? "none"
                                : "1px solid #f1f5f9",
                            backgroundColor:
                              index % 2 === 0 ? "#ffffff" : "#f8fafc",
                          }}
                        >
                          <td
                            style={{
                              padding: "12px 16px",
                              fontWeight: 500,
                              color: "#0f172a",
                            }}
                          >
                            <code>{ds.dataset_code}</code>
                          </td>
                          <td
                            style={{ padding: "12px 16px", color: "#334155" }}
                          >
                            {ds.dataset_name}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "right",
                              fontWeight: 600,
                              color: "#1e293b",
                            }}
                          >
                            {(ds.count ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Variable Codes List */}
            <div className="co2-card" style={{ margin: 0 }}>
              <div className="co2-card-header">
                <h3>
                  <i
                    className="fa fa-sliders-h"
                    style={{ marginRight: "8px", color: "#f59e0b" }}
                  ></i>
                  Danh sách biến số
                </h3>
              </div>
              <div className="co2-card-body" style={{ padding: "20px" }}>
                {!summary.unique_variable_codes ||
                summary.unique_variable_codes.length === 0 ? (
                  <p style={{ color: "#64748b", textAlign: "center" }}>
                    Không có biến số nào
                  </p>
                ) : (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    {(summary.unique_variable_codes ?? []).map((code) => (
                      <span
                        key={code}
                        style={{
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          padding: "6px 12px",
                          borderRadius: "16px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid #fde68a",
                        }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GridDataPage;
