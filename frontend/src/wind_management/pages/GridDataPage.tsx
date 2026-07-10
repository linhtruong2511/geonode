import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useWindStore } from "../stores/useWindStore";

interface DatasetSummary {
  dataset_code: string;
  dataset_name: string;
  count: number;
}

interface SummaryData {
  total_granules: number;
  min_granule_time: string | null;
  max_granule_time: string | null;
  datasets: DatasetSummary[];
  unique_variable_codes: string[];
}

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
  const { activeGridLayers, setCurrentTime, selectedDatasetId, setSelectedDatasetId, setDatasetVariables, datasetVariables, setActiveGridLayers } = useWindStore();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [datasetsList, setDatasetsList] = useState<any[]>([]);
  const [timeSteps, setTimeSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState<string>("");

  const getUtcParts = (isoString: string) => {
    const d = new Date(isoString);
    return {
      year: d.getUTCFullYear().toString(),
      month: (d.getUTCMonth() + 1).toString().padStart(2, "0"),
      day: d.getUTCDate().toString().padStart(2, "0"),
      hour: d.getUTCHours().toString().padStart(2, "0") + ":" + d.getUTCMinutes().toString().padStart(2, "0")
    };
  };

  const parsedTimes = timeSteps.map(t => ({ ...getUtcParts(t), original: t }));

  // Helper to extract options
  const availableYears = Array.from(new Set(parsedTimes.map(p => p.year))).sort();
  
  const availableMonths = Array.from(
    new Set(parsedTimes.filter(p => p.year === selectedYear).map(p => p.month))
  ).sort();

  const availableDays = Array.from(
    new Set(
      parsedTimes
        .filter(p => p.year === selectedYear && p.month === selectedMonth)
        .map(p => p.day)
    )
  ).sort();

  const availableHours = Array.from(
    new Set(
      parsedTimes
        .filter(
          p =>
            p.year === selectedYear &&
            p.month === selectedMonth &&
            p.day === selectedDay
        )
        .map(p => p.hour)
    )
  ).sort();

  // Group variables into u/v combos or single variables
  const variableCombos = useMemo(() => {
    const combos: { value: string; label: string }[] = [];
    const processed = new Set<string>();

    datasetVariables.forEach((v) => {
      const code = v.variable_code;
      if (processed.has(code)) return;

      if (code.startsWith("u")) {
        const suffix = code.slice(1);
        const companion = `v${suffix}`;
        const companionVar = datasetVariables.find((x) => x.variable_code === companion);

        if (companionVar) {
          combos.push({
            value: `${code},${companion}`,
            label: `Trường gió ${suffix} (${code} & ${companion})`,
          });
          processed.add(code);
          processed.add(companion);
          return;
        }
      } else if (code.startsWith("v")) {
        const suffix = code.slice(1);
        const companion = `u${suffix}`;
        const companionVar = datasetVariables.find((x) => x.variable_code === companion);

        if (companionVar) {
          combos.push({
            value: `${companion},${code}`,
            label: `Trường gió ${suffix} (${companion} & ${code})`,
          });
          processed.add(code);
          processed.add(companion);
          return;
        }
      }

      // Single variable
      combos.push({
        value: code,
        label: `${v.variable_name} (${code})`,
      });
      processed.add(code);
    });

    return combos;
  }, [datasetVariables]);

  useEffect(() => {
    // Tự động bật u10m & v10m (gió) khi người dùng truy cập trang này
    if (activeGridLayers.length === 0) {
      setActiveGridLayers(["u10m", "v10m"]);
    }

    setLoading(true);
    setError(null);

    // Fetch summary metrics
    axios
      .get<SummaryData>("/wind/api/v1/raster-granules/summary/")
      .then((res) => {
        setSummary(res.data);
      })
      .catch((err) => {
        console.error("Error fetching summary metrics:", err);
      });

    // Fetch available datasets
    axios
      .get("/wind/api/v1/datasets/?category=GRIDDED")
      .then((res) => {
        const results = res.data.results || res.data;
        setDatasetsList(results);
        if (results.length > 0) {
          setSelectedDatasetId(results[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching datasets:", err);
        setError("Không thể tải danh sách bộ dữ liệu.");
        setLoading(false);
      });
  }, []);

  // Fetch time steps and variables when selected dataset changes
  useEffect(() => {
    if (!selectedDatasetId) return;

    setCurrentTime(null);

    axios
      .get(`/wind/api/v1/datasets/${selectedDatasetId}/time_steps/`)
      .then((res) => {
        const steps = res.data.time_steps || [];
        setTimeSteps(steps);
      })
      .catch((err) => {
        console.error("Error fetching time steps:", err);
      });

    axios
      .get(`/wind/api/v1/datasets/${selectedDatasetId}/get_variables/`)
      .then((res) => {
        const vars = res.data.variables || [];
        setDatasetVariables(vars);
      })
      .catch((err) => {
        console.error("Error fetching dataset variables:", err);
      });
  }, [selectedDatasetId]);

  // Set default variable when datasetVariables changes
  useEffect(() => {
    if (variableCombos.length > 0) {
      // Check if current active layer matches any valid variable in this dataset
      const isValid = activeGridLayers.some(l => datasetVariables.some(v => v.variable_code === l));
      if (!isValid) {
        const defaultVal = variableCombos[0].value;
        setActiveGridLayers(defaultVal.split(","));
      }
    }
  }, [variableCombos, datasetVariables]);

  // Set default selection when timeSteps changes
  useEffect(() => {
    if (timeSteps.length === 0) {
      setSelectedYear("");
      setSelectedMonth("");
      setSelectedDay("");
      setSelectedHour("");
      return;
    }

    const firstPart = getUtcParts(timeSteps[0]);
    setSelectedYear(firstPart.year);
    setSelectedMonth(firstPart.month);
    setSelectedDay(firstPart.day);
    setSelectedHour(firstPart.hour);
  }, [timeSteps]);

  // Sync currentTime to the store when selections change
  useEffect(() => {
    if (!selectedYear || !selectedMonth || !selectedDay || !selectedHour) return;

    const matched = parsedTimes.find(
      p =>
        p.year === selectedYear &&
        p.month === selectedMonth &&
        p.day === selectedDay &&
        p.hour === selectedHour
    );

    if (matched) {
      setCurrentTime(matched.original);
    }
  }, [selectedYear, selectedMonth, selectedDay, selectedHour, timeSteps]);

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedDatasetId(val);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const yr = e.target.value;
    setSelectedYear(yr);

    const monthsForYr = Array.from(new Set(parsedTimes.filter(p => p.year === yr).map(p => p.month))).sort();
    const defaultMonth = monthsForYr[0] || "";
    setSelectedMonth(defaultMonth);

    const daysForMonth = Array.from(new Set(parsedTimes.filter(p => p.year === yr && p.month === defaultMonth).map(p => p.day))).sort();
    const defaultDay = daysForMonth[0] || "";
    setSelectedDay(defaultDay);

    const hoursForDay = Array.from(
      new Set(
        parsedTimes
          .filter(p => p.year === yr && p.month === defaultMonth && p.day === defaultDay)
          .map(p => p.hour)
      )
    ).sort();
    const defaultHour = hoursForDay[0] || "";
    setSelectedHour(defaultHour);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value;
    setSelectedMonth(m);

    const daysForMonth = Array.from(new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === m).map(p => p.day))).sort();
    const defaultDay = daysForMonth[0] || "";
    setSelectedDay(defaultDay);

    const hoursForDay = Array.from(
      new Set(
        parsedTimes
          .filter(p => p.year === selectedYear && p.month === m && p.day === defaultDay)
          .map(p => p.hour)
      )
    ).sort();
    const defaultHour = hoursForDay[0] || "";
    setSelectedHour(defaultHour);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = e.target.value;
    setSelectedDay(d);

    const hoursForDay = Array.from(
      new Set(
        parsedTimes
          .filter(p => p.year === selectedYear && p.month === selectedMonth && p.day === d)
          .map(p => p.hour)
      )
    ).sort();
    const defaultHour = hoursForDay[0] || "";
    setSelectedHour(defaultHour);
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
                onChange={handleYearChange}
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
                onChange={handleMonthChange}
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
                onChange={handleDayChange}
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
