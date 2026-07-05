import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useFetchData } from '@common/hooks/useFetchData';
import { useMapStore } from '../../common/stores/useMapStore';

interface Measurement {
  id: number;
  measurement_time: string;
  latitude: number;
  longitude: number;
  xco2_ppm: number;
  xco2_quality_flag: number;
  data_source: string;
}

const MeasurementList: React.FC = () => {
  const { setShowMap, setMapData, setMapCenter, setMapZoom, mapBounds, isSpatialSearchEnabled, setFocusedId } = useMapStore();
  
  // Các trường tìm kiếm/lọc
  const [filters, setFilters] = useState({
    source: '',
    quality: '',
    min_xco2: '',
    max_xco2: '',
    date_from: '',
    date_to: '',
  });

  // Quản lý phân trang
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
  });

  // State quản lý chọn nhiều bản ghi
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // State quản lý các ID điểm đo bị ẨN khỏi bản đồ (Frontend State)
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  
  // State hiển thị chi tiết của một bản ghi (Modal)
  const [activeDetail, setActiveDetail] = useState<Measurement | null>(null);

  // Kích hoạt bản đồ khi component được mount, ẩn đi khi hủy
  useEffect(() => {
    setShowMap(true);
    // Bản đồ hiển thị lên lần đầu luôn có bound ở khu vực miền bắc - trung tâm là hà nội
    setMapCenter([21.028511, 105.804817]);
    setMapZoom(8);
    return () => {
      setShowMap(false);
      setMapData([]);
      setFocusedId(null);
    };
  }, [setShowMap, setMapCenter, setMapZoom, setMapData, setFocusedId]);

  // Thiết lập tham số gửi lên API
  const fetchParams = useMemo(() => {
    const params: any = {
      page: pageIndex + 1,
      pageSize: pageSize,
    };
    if (filters.source) params.source = filters.source;
    if (filters.quality !== '') params.quality = filters.quality;
    if (filters.min_xco2) params.min_xco2 = filters.min_xco2;
    if (filters.max_xco2) params.max_xco2 = filters.max_xco2;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;

    // Lọc theo không gian (Bounding Box từ bản đồ)
    if (isSpatialSearchEnabled && mapBounds) {
      params.min_lat = mapBounds.south;
      params.max_lat = mapBounds.north;
      params.min_lon = mapBounds.west;
      params.max_lon = mapBounds.east;
    }

    return params;
  }, [pageIndex, pageSize, filters, isSpatialSearchEnabled, mapBounds]);

  // Lấy dữ liệu thông qua hook chung
  const { data, totalCount, loading, refresh } = useFetchData<Measurement>('/co2/api/v1/measurements/', fetchParams);

  // Cập nhật các điểm đo lên bản đồ (LOẠI BỎ CÁC ĐIỂM ĐO BỊ ẨN)
  useEffect(() => {
    const visibleData = data.filter(item => !hiddenIds.includes(item.id));
    setMapData(visibleData);
  }, [data, hiddenIds, setMapData]);

  // Reset các ô đã chọn khi thay đổi trang hoặc bộ lọc
  useEffect(() => {
    setSelectedIds([]);
  }, [pageIndex, pageSize, filters]);

  // Xử lý thay đổi các ô nhập bộ lọc
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  };

  const pageCount = Math.ceil(totalCount / pageSize);

  // ─── HÀM HỖ TRỢ XỬ LÝ CSRF & BẢN GHI ────────────────────────────────────

  // Lấy CSRF token từ cookies để xác thực an toàn với Django
  const getCookie = (name: string) => {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  };

  // Chọn hoặc hủy chọn một dòng đơn lẻ
  const handleRowSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Chọn toàn bộ hoặc hủy chọn toàn bộ danh sách ở trang hiện tại
  const handleSelectAll = () => {
    if (data.length === 0) return;
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(item => item.id));
    }
  };

  // Xử lý Ẩn/Hiện đơn lẻ điểm đo trên bản đồ
  const handleToggleHideSingle = (id: number) => {
    setHiddenIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Ẩn hàng loạt các điểm đo được chọn khỏi bản đồ
  const handleBulkHide = () => {
    if (selectedIds.length === 0) return;
    setHiddenIds(prev => {
      const newHidden = [...prev];
      selectedIds.forEach(id => {
        if (!newHidden.includes(id)) {
          newHidden.push(id);
        }
      });
      return newHidden;
    });
    setSelectedIds([]);
  };

  // Hiện hàng loạt các điểm đo được chọn lên bản đồ
  const handleBulkShow = () => {
    if (selectedIds.length === 0) return;
    setHiddenIds(prev => prev.filter(id => !selectedIds.includes(id)));
    setSelectedIds([]);
  };

  // Xóa một điểm đo đơn lẻ (Xóa mềm phía backend)
  const handleSingleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa điểm đo này?")) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await axios.delete(`/co2/api/v1/measurements/${id}/`, { headers });
      refresh();
      setSelectedIds(prev => prev.filter(x => x !== id));
      setHiddenIds(prev => prev.filter(x => x !== id));
      alert("Đã xóa điểm đo thành công!");
    } catch (err: any) {
      alert("Có lỗi xảy ra khi xóa điểm đo.");
    }
  };

  // Xóa hàng loạt điểm đo được chọn
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} điểm đo đã chọn?`)) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await axios.post('/co2/api/v1/measurements/bulk_delete/', { ids: selectedIds }, { headers });
      refresh();
      setHiddenIds(prev => prev.filter(id => !selectedIds.includes(id)));
      setSelectedIds([]);
      alert("Đã xóa các điểm đo thành công!");
    } catch (err: any) {
      alert("Có lỗi xảy ra khi xóa các điểm đo.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="co2-page-title" style={{ marginBottom: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Dữ liệu đo lường XCO2</h3>
          <p style={{ fontSize: '11px', margin: 0 }}>Truy vấn dữ liệu từ các vệ tinh</p>
        </div>
      </div>

      {/* Bộ lọc Dữ liệu */}
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Vệ tinh</label>
            <select name="source" value={filters.source} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="OCO2">OCO-2</option>
              <option value="GOSAT2">GOSAT-2</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Chất lượng</label>
            <select name="quality" value={filters.quality} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="0">Tốt</option>
              <option value="1">Kém</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>XCO2 Min</label>
            <input type="number" name="min_xco2" value={filters.min_xco2} onChange={handleFilterChange} placeholder="400" style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>XCO2 Max</label>
            <input type="number" name="max_xco2" value={filters.max_xco2} onChange={handleFilterChange} placeholder="420" style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Từ ngày</label>
            <input type="date" name="date_from" value={filters.date_from} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Đến ngày</label>
            <input type="date" name="date_to" value={filters.date_to} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
        </div>
        
        {/* Liên kết sang Báo cáo thống kê */}
        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
          <Link 
            to="/statistics" 
            style={{ 
              fontSize: '11px', 
              color: 'var(--color-accent-primary)', 
              textDecoration: 'none', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px',
              fontWeight: 500
            }}
            className="co2-stats-link"
          >
            <i className="fa fa-bar-chart"></i> Xem báo cáo thống kê phân tích XCO2 &rarr;
          </Link>
        </div>
      </div>

      {/* ─── THANH CÔNG CỤ TÁC VỤ HÀNG LOẠT (BULK TOOLBAR) ────────────────── */}
      <div style={{
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#f8fafc',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        padding: '8px 12px',
        marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input 
            type="checkbox" 
            checked={data.length > 0 && selectedIds.length === data.length}
            onChange={handleSelectAll}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Chọn tất cả ({data.length})
          </span>
          {selectedIds.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--color-accent-primary)', marginLeft: '10px' }}>
              Đang chọn: <strong>{selectedIds.length}</strong> bản ghi
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleBulkShow}
            disabled={selectedIds.length === 0}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              borderRadius: '4px',
              border: '1px solid #10b981',
              backgroundColor: '#fff',
              color: '#10b981',
              fontWeight: 600
            }}
            title="Hiện các điểm đo này trên bản đồ"
          >
            <i className="fa fa-eye"></i> Hiện bản đồ
          </button>
          <button
            onClick={handleBulkHide}
            disabled={selectedIds.length === 0}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              borderRadius: '4px',
              border: '1px solid #f59e0b',
              backgroundColor: '#fff',
              color: '#f59e0b',
              fontWeight: 600
            }}
            title="Ẩn các điểm đo này khỏi bản đồ"
          >
            <i className="fa fa-eye-slash"></i> Ẩn bản đồ
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              borderRadius: '4px',
              border: '1px solid #ef4444',
              backgroundColor: '#fff',
              color: '#ef4444',
              fontWeight: 600
            }}
            title="Xóa các điểm đo này khỏi hệ thống"
          >
            <i className="fa fa-trash"></i> Xóa nhiều
          </button>
        </div>
      </div>

      {/* Danh sách các Điểm đo */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
        {loading ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Đang tải...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Không có dữ liệu</div>
        ) : (
          data.map((item) => {
            const isHidden = hiddenIds.includes(item.id);
            return (
              <div 
                key={item.id} 
                style={{ 
                  padding: '8px 12px', 
                  borderBottom: '1px solid var(--color-border)', 
                  background: selectedIds.includes(item.id) ? '#f0f9ff' : '#fff',
                  opacity: isHidden ? 0.55 : 1,
                  transition: 'opacity 0.2s'
                }}
              >
                
                {/* Thanh công cụ thao tác trên mỗi hàng (Row Action Icons) */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '4px', alignItems: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(item.id)}
                    onChange={() => handleRowSelect(item.id)}
                    style={{ margin: 0, cursor: 'pointer' }} 
                  />
                  <i 
                    className="fa fa-crosshairs" 
                    onClick={() => {
                      if (isHidden) {
                        alert("Điểm đo này đang bị ẩn khỏi bản đồ. Vui lòng hiện bản đồ trước!");
                        return;
                      }
                      setMapCenter([item.latitude, item.longitude]);
                      setMapZoom(12);
                      setFocusedId(item.id);
                    }}
                    style={{ 
                      cursor: isHidden ? 'not-allowed' : 'pointer', 
                      color: isHidden ? '#cbd5e1' : 'var(--color-text-secondary)', 
                      fontSize: '12px' 
                    }} 
                    title="Định vị & phóng to trên bản đồ"
                  ></i>
                  <i 
                    className="fa fa-info-circle" 
                    onClick={() => setActiveDetail(item)}
                    style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '12px' }} 
                    title="Chi tiết điểm đo"
                  ></i>
                  
                  {/* ICON ẨN / HIỆN TRÊN BẢN ĐỒ */}
                  <i 
                    className={isHidden ? "fa fa-eye-slash" : "fa fa-eye"} 
                    onClick={() => handleToggleHideSingle(item.id)}
                    style={{ 
                      cursor: 'pointer', 
                      color: isHidden ? '#f59e0b' : '#10b981', 
                      fontSize: '12px' 
                    }} 
                    title={isHidden ? "Hiện điểm đo này trên bản đồ" : "Ẩn điểm đo này khỏi bản đồ"}
                  ></i>

                  <i 
                    className="fa fa-trash" 
                    onClick={() => handleSingleDelete(item.id)}
                    style={{ cursor: 'pointer', color: '#ef4444', fontSize: '12px' }} 
                    title="Xóa điểm đo này"
                  ></i>
                  <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {item.data_source}
                  </div>
                </div>
                
                {/* Thông tin chính */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                    {item.xco2_ppm.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 400 }}>ppm</span>
                    {isHidden && (
                      <span style={{ fontSize: '10px', color: '#f59e0b', marginLeft: '6px', fontWeight: 600, backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>
                        Đã ẩn bản đồ
                      </span>
                    )}
                  </div>
                  <div>
                    {item.xco2_quality_flag === 0 ? (
                      <span style={{ color: '#059669', fontSize: '10px', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 4px', borderRadius: '3px' }}>Tốt</span>
                    ) : (
                      <span style={{ color: '#d97706', fontSize: '10px', fontWeight: 600, backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>Kém</span>
                    )}
                  </div>
                </div>
                
                {/* Thông tin phụ */}
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <i className="fa fa-map-marker" style={{ fontSize: '10px' }}></i>
                    {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <i className="fa fa-clock-o" style={{ fontSize: '10px' }}></i>
                    {new Date(item.measurement_time).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Điều khiển Phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>Tổng số: <strong>{totalCount}</strong></span>
          <span style={{ color: 'var(--color-border)', margin: '0 2px' }}>|</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Hiển thị:
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setPagination({ pageIndex: 0, pageSize: newSize });
              }}
              style={{
                padding: '2px 4px',
                fontSize: '11px',
                borderRadius: '3px',
                border: '1px solid var(--color-border)',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex - 1 }))}
            disabled={pageIndex === 0}
            style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid var(--color-border)', backgroundColor: pageIndex === 0 ? '#f1f5f9' : '#fff', cursor: pageIndex === 0 ? 'not-allowed' : 'pointer' }}
          >
            Trước
          </button>
          <span>{pageIndex + 1} / {pageCount || 1}</span>
          <button 
            onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
            disabled={pageIndex >= pageCount - 1}
            style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid var(--color-border)', backgroundColor: pageIndex >= pageCount - 1 ? '#f1f5f9' : '#fff', cursor: pageIndex >= pageCount - 1 ? 'not-allowed' : 'pointer' }}
          >
            Sau
          </button>
        </div>
      </div>

      {/* ─── MODAL HIỂN THỊ CHI TIẾT ĐIỂM ĐO (DETAIL DIALOG) ───────────────── */}
      {activeDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '90%',
            maxWidth: '420px',
            overflow: 'hidden',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              background: '#f8fafc'
            }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Chi tiết Điểm đo #{activeDetail.id}
              </h4>
              <button 
                onClick={() => setActiveDetail(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)'
                }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ padding: '16px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '10px 15px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Nguồn vệ tinh:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>{activeDetail.data_source}</strong>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Nồng độ XCO2:</span>
                <strong style={{ fontSize: '15px', color: 'var(--color-accent-primary)' }}>
                  {activeDetail.xco2_ppm.toFixed(4)} ppm
                </strong>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Chất lượng:</span>
                <span>
                  {activeDetail.xco2_quality_flag === 0 ? (
                    <span style={{ color: '#059669', fontWeight: 600, backgroundColor: '#d1fae5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Tốt (Usable)</span>
                  ) : (
                    <span style={{ color: '#d97706', fontWeight: 600, backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Kém (Flagged)</span>
                  )}
                </span>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Vĩ độ:</span>
                <span>{activeDetail.latitude.toFixed(6)}°</span>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Kinh độ:</span>
                <span>{activeDetail.longitude.toFixed(6)}°</span>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Thời gian đo:</span>
                <span>{new Date(activeDetail.measurement_time).toLocaleString('vi-VN')}</span>
              </div>
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 16px',
              borderTop: '1px solid var(--color-border)',
              background: '#f8fafc'
            }}>
              <button 
                onClick={() => setActiveDetail(null)}
                style={{
                  padding: '6px 16px',
                  background: 'var(--color-accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '12px'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MeasurementList;
