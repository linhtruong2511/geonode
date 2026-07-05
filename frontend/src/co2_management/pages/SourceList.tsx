import React, { useState, useEffect, useMemo } from 'react';
import { useFetchData } from '@common/hooks/useFetchData';
import axios from 'axios';
import { useMapStore } from '../../common/stores/useMapStore';

interface MeasurementMetadata {
  id: number;
  min_xco2?: number;
  max_xco2?: number;
  mean_xco2?: number;
  coverage_stats?: {
    count?: number;
    [key: string]: any;
  };
}

interface MeasurementSource {
  id: number;
  file_name: string;
  file_format: string;
  measurement_date: string;
  quality_checked: boolean;
  file_size_mb?: number;
  processing_level?: string;
  total_soundings?: number;
  algorithm_version?: string;
  file_hash?: string;
  metadata?: MeasurementMetadata;
}

const SourceList: React.FC = () => {
  // Lấy các hàm điều khiển bản đồ từ Store dùng chung
  const { setShowMap, setMapData, setMapCenter, setMapZoom, setFocusedId } = useMapStore();

  // Quản lý phân trang
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Các trường tìm kiếm/lọc giống MeasurementList
  const [filters, setFilters] = useState({
    satellite: '',
    format: '',
    quality_checked: '',
    date_from: '',
    date_to: '',
  });

  // State hỗ trợ tải lại danh sách
  const [refetchKey, setRefetchKey] = useState(0);

  // State quản lý chọn nhiều bản ghi
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // State hiển thị chi tiết của một bản ghi (Modal)
  const [activeDetail, setActiveDetail] = useState<MeasurementSource | null>(null);

  // Thiết lập các tham số gửi lên API dựa trên các bộ lọc
  const fetchParams = useMemo(() => {
    const params: any = {
      page: pageIndex + 1,
      pageSize: pageSize,
      _refetch: refetchKey,
    };

    if (filters.satellite) params.satellite = filters.satellite;
    if (filters.format) params.format = filters.format;
    if (filters.quality_checked !== '') params.quality_checked = filters.quality_checked;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;

    return params;
  }, [pageIndex, pageSize, filters, refetchKey]);

  // Lấy dữ liệu thông qua hook dùng chung của dự án
  const { data, totalCount, loading } = useFetchData<MeasurementSource>('/co2/api/v1/sources/', fetchParams);

  // Kích hoạt bản đồ khi mở trang, dọn dẹp khi chuyển trang khác
  useEffect(() => {
    setShowMap(true);
    // Bản đồ hiển thị lên lần đầu luôn có bound ở khu vực miền bắc - trung tâm là hà nội
    setMapCenter([21.028511, 105.804817]);
    setMapZoom(8);
    return () => {
      setMapData([]);
      setFocusedId(null);
    };
  }, [setShowMap, setMapCenter, setMapZoom, setMapData, setFocusedId]);

  // Reset danh sách được chọn khi phân trang, thay đổi bộ lọc hoặc tải lại danh sách
  useEffect(() => {
    setSelectedIds([]);
  }, [pageIndex, pageSize, filters, refetchKey]);

  // Xử lý thay đổi các ô nhập bộ lọc
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  };

  // Lấy CSRF token từ cookies để bảo mật khi gửi request DELETE/POST lên Django
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

  // Chọn hoặc bỏ chọn một hàng đơn lẻ
  const handleRowSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Chọn hoặc bỏ chọn toàn bộ hàng trong trang hiện tại
  const handleSelectAll = () => {
    if (data.length === 0) return;
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(item => item.id));
    }
  };

  // Hiển thị các điểm đo của tệp tin này lên bản đồ
  const handleShowPointsOnMap = async (sourceId: number, fileName: string) => {
    try {
      // Gọi API lấy dữ liệu đo lường lọc theo source_id với giới hạn lớn (ví dụ: 1000 điểm)
      const res = await axios.get(`/co2/api/v1/measurements/?source_id=${sourceId}&limit=1000`);
      const points = res.data.results || res.data || [];
      
      if (points.length === 0) {
        alert(`Tệp tin "${fileName}" chưa được import dữ liệu hoặc không có điểm đo nào!`);
        return;
      }
      
      // Đưa dữ liệu lên bản đồ thông qua MapStore
      setMapData(points);
      
      // Định vị bản đồ vào điểm đo đầu tiên của tệp tin
      const firstPoint = points[0];
      if (firstPoint && firstPoint.latitude && firstPoint.longitude) {
        setMapCenter([firstPoint.latitude, firstPoint.longitude]);
        setMapZoom(8);
      }
      
      alert(`Đã hiển thị thành công ${points.length} điểm đo của tệp tin lên bản đồ!`);
    } catch (err) {
      console.error(err);
      alert('Không thể tải các điểm đo của tệp tin này lên bản đồ!');
    }
  };

  // Hiển thị điểm đo của tất cả các tệp tin đang được chọn lên bản đồ cùng lúc
  const handleBulkShow = async () => {
    if (selectedIds.length === 0) return;
    try {
      // Gọi API song song cho tất cả tệp tin được chọn để tối ưu thời gian phản hồi
      const promises = selectedIds.map(id => 
        axios.get(`/co2/api/v1/measurements/?source_id=${id}&limit=500`)
      );
      const responses = await Promise.all(promises);
      let allPoints: any[] = [];
      responses.forEach(res => {
        const points = res.data.results || res.data || [];
        allPoints = [...allPoints, ...points];
      });
      
      if (allPoints.length === 0) {
        alert("Các tệp nguồn đã chọn chưa được import dữ liệu hoặc không có điểm đo nào!");
        return;
      }
      
      // Đưa toàn bộ điểm đo tìm được lên bản đồ
      setMapData(allPoints);
      
      // Định vị bản đồ
      const firstPoint = allPoints[0];
      if (firstPoint && firstPoint.latitude && firstPoint.longitude) {
        setMapCenter([firstPoint.latitude, firstPoint.longitude]);
        setMapZoom(6);
      }
      
      alert(`Đã hiển thị thành công tổng cộng ${allPoints.length} điểm đo của các tệp nguồn lên bản đồ!`);
    } catch (err) {
      console.error(err);
      alert("Không thể hiển thị các điểm đo hàng loạt!");
    }
  };

  // Xóa một tệp tin nguồn đơn lẻ
  const handleSingleDelete = async (id: number, fileName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp tin "${fileName}" và tất cả điểm đo liên quan?`)) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await axios.delete(`/co2/api/v1/sources/${id}/`, { headers });
      setRefetchKey(prev => prev + 1); // Refresh list
      alert("Đã xóa tệp tin nguồn thành công!");
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi xóa tệp tin nguồn.");
    }
  };

  // Xóa hàng loạt tệp tin nguồn được chọn
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} tệp tin đã chọn và toàn bộ dữ liệu đo liên quan?`)) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await axios.post('/co2/api/v1/sources/bulk_delete/', { ids: selectedIds }, { headers });
      setRefetchKey(prev => prev + 1); // Refresh list
      alert("Đã xóa các tệp tin nguồn thành công!");
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi xóa các tệp tin nguồn.");
    }
  };

  // Phân tích trạng thái nồng độ XCO2 trung bình để trả về màu sắc phù hợp
  const getCO2LevelBadge = (meanVal: number) => {
    if (meanVal < 410) {
      return { text: 'Bình thường', color: '#10b981', bg: '#d1fae5' };
    } else if (meanVal < 415) {
      return { text: 'Trung bình', color: '#d97706', bg: '#fef3c7' };
    } else if (meanVal < 420) {
      return { text: 'Cao', color: '#f97316', bg: '#ffedd5' };
    } else {
      return { text: 'Rất cao', color: '#ef4444', bg: '#fee2e2' };
    }
  };

  /**
   * Rút gọn tên file nếu độ dài vượt quá giới hạn cho phép nhằm tránh làm vỡ giao diện.
   * Hàm này sẽ giữ lại đuôi file để người dùng vẫn biết được định dạng file (ví dụ: .nc, .csv).
   * 
   * @param name Tên file đầy đủ
   * @param maxLength Độ dài tối đa cho phép hiển thị
   */
  const formatFileName = (name: string, maxLength: number = 28) => {
    if (!name) return '';
    if (name.length <= maxLength) return name;
    
    const dotIndex = name.lastIndexOf('.');
    // Nếu file có đuôi mở rộng hợp lệ (độ dài đuôi tính cả dấu chấm <= 6 ký tự)
    if (dotIndex !== -1 && name.length - dotIndex <= 6) {
      const ext = name.substring(dotIndex);
      const mainName = name.substring(0, dotIndex);
      
      // Số lượng ký tự tối đa dành cho phần tên chính (sau khi trừ đi đuôi và 3 ký tự của dấu '...')
      const allowedMainLength = maxLength - ext.length - 3;
      if (allowedMainLength > 0) {
        return mainName.substring(0, allowedMainLength) + '...' + ext;
      }
    }
    
    // Trường hợp không có đuôi file hoặc đuôi file quá dài, cắt chuỗi bình thường
    return name.substring(0, maxLength - 3) + '...';
  };

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="co2-page-title" style={{ marginBottom: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Quản lý tệp dữ liệu nguồn</h3>
          <p style={{ fontSize: '11px', margin: 0 }}>Danh sách các file vệ tinh đã tải lên hệ thống</p>
        </div>
      </div>

      {/* Bộ lọc Dữ liệu Tệp nguồn */}
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Vệ tinh</label>
            <select name="satellite" value={filters.satellite} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="OCO2">OCO-2</option>
              <option value="GOSAT2">GOSAT-2</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Định dạng</label>
            <select name="format" value={filters.format} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="NETCDF4">NetCDF4</option>
              <option value="HDF5">HDF5</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Kiểm định</label>
            <select name="quality_checked" value={filters.quality_checked} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="1">Đã xong</option>
              <option value="0">Chờ xử lý</option>
            </select>
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
            title="Hiện các điểm đo của các file đã chọn trên bản đồ"
          >
            <i className="fa fa-eye"></i> Hiện bản đồ
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
            title="Xóa các tệp nguồn và dữ liệu đo liên quan"
          >
            <i className="fa fa-trash"></i> Xóa nhiều
          </button>
        </div>
      </div>

      {/* List of Sources - No Table, No Card */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
        {loading ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Đang tải...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Không có dữ liệu</div>
        ) : (
          data.map((item) => (
            <div 
              key={item.id} 
              style={{ 
                padding: '8px 12px', 
                borderBottom: '1px solid var(--color-border)', 
                background: selectedIds.includes(item.id) ? '#f0f9ff' : '#fff',
                transition: 'background-color 0.2s'
              }}
            >
              {/* Tools on top of row */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '2px', alignItems: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={selectedIds.includes(item.id)}
                  onChange={() => handleRowSelect(item.id)}
                  style={{ margin: 0, cursor: 'pointer' }} 
                />
                <i 
                  className="fa fa-info-circle" 
                  onClick={() => setActiveDetail(item)}
                  style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '12px' }} 
                  title="Xem chi tiết tệp tin nguồn"
                ></i>
                <i 
                  className="fa fa-trash" 
                  onClick={() => handleSingleDelete(item.id, item.file_name)}
                  style={{ cursor: 'pointer', color: '#ef4444', fontSize: '12px' }} 
                  title="Xóa tệp tin nguồn này"
                ></i>
                <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  ID: {item.id}
                </div>
              </div>
              
              {/* Main Info - Important info larger */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div 
                  title={item.file_name}
                  style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}
                >
                  {formatFileName(item.file_name)}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {item.quality_checked ? (
                    <span style={{ color: '#059669', fontSize: '10px', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 4px', borderRadius: '3px' }}>Đã xong</span>
                  ) : (
                    <span style={{ color: '#d97706', fontSize: '10px', fontWeight: 600, backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>Chờ xử lý</span>
                  )}
                  
                  {/* NÚT BẢN ĐỒ (THAY CHO NÚT IMPORT): CLICK ĐỂ SHOW CÁC ĐIỂM ĐO LÊN BẢN ĐỒ */}
                  <button 
                    onClick={() => handleShowPointsOnMap(item.id, item.file_name)}
                    style={{ 
                      padding: '2px 6px', 
                      fontSize: '10px', 
                      border: '1px solid #10b981', 
                      borderRadius: '3px', 
                      background: '#fff', 
                      color: '#10b981', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontWeight: 600
                    }}
                    title="Hiển thị các điểm đo của tệp tin này trên bản đồ"
                  >
                    <i className="fa fa-globe"></i>
                    Bản đồ
                  </button>
                </div>
              </div>
              
              {/* Sub Info */}
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-file" style={{ fontSize: '10px' }}></i>
                  {item.file_format} ({item.file_size_mb ? item.file_size_mb.toLocaleString() : '0'} MB)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-calendar" style={{ fontSize: '10px' }}></i>
                  {item.measurement_date ? new Date(item.measurement_date).toLocaleDateString('vi-VN') : 'N/A'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="fa fa-level-up" style={{ fontSize: '10px' }}></i>
                  Level: {item.processing_level || 'N/A'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Control */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px' }}>
        <div>
          Tổng số: <strong>{totalCount}</strong>
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

      {/* ─── MODAL HIỂN THỊ CHI TIẾT FILE NGUỒN (DETAIL DIALOG) ───────────────── */}
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
            width: '95%',
            maxWidth: '500px',
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
                Chi tiết Tệp dữ liệu nguồn #{activeDetail.id}
              </h4>
              <button 
                onClick={() => setActiveDetail(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ padding: '16px', fontSize: '13px', maxHeight: '78vh', overflowY: 'auto' }}>
              {/* Thông tin cơ bản */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '8px 15px', wordBreak: 'break-all', marginBottom: '15px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Tên tệp tin:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>{activeDetail.file_name}</strong>
                
                <span style={{ color: 'var(--color-text-secondary)' }}>Định dạng:</span>
                <span>{activeDetail.file_format}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Dung lượng:</span>
                <span>{activeDetail.file_size_mb ? `${activeDetail.file_size_mb.toLocaleString()} MB` : 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Ngày đo đạc:</span>
                <span>{activeDetail.measurement_date ? new Date(activeDetail.measurement_date).toLocaleDateString('vi-VN') : 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Cấp độ xử lý:</span>
                <span>Level {activeDetail.processing_level || 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Tổng số điểm đo:</span>
                <span>{activeDetail.total_soundings ? activeDetail.total_soundings.toLocaleString() : 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Thuật toán:</span>
                <span>{activeDetail.algorithm_version || 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>SHA-256 Hash:</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#475569' }}>{activeDetail.file_hash || 'N/A'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Kiểm định:</span>
                <span>
                  {activeDetail.quality_checked ? (
                    <span style={{ color: '#059669', fontWeight: 600, backgroundColor: '#d1fae5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Đã hoàn thành</span>
                  ) : (
                    <span style={{ color: '#d97706', fontWeight: 600, backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Chờ xử lý</span>
                  )}
                </span>
              </div>

              {/* 📊 PHẦN BÁO CÁO THỐNG KÊ NỒNG ĐỘ XCO2 */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '15px', marginTop: '12px' }}>
                <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa fa-bar-chart" style={{ color: 'var(--color-accent-primary)' }}></i>
                  Báo cáo thống kê nồng độ XCO2
                </h5>

                {activeDetail.metadata ? (
                  (() => {
                    const min = Number(activeDetail.metadata.min_xco2);
                    const max = Number(activeDetail.metadata.max_xco2);
                    const mean = Number(activeDetail.metadata.mean_xco2);
                    const range = max - min;
                    const avgPercent = range > 0 ? ((mean - min) / range) * 100 : 50;
                    const badge = getCO2LevelBadge(mean);

                    return (
                      <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                        {/* Nồng độ trung bình */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Nồng độ trung bình (Mean)</span>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                              {mean.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>ppm</span>
                            </span>
                          </div>
                          <span style={{ 
                            color: badge.color, 
                            backgroundColor: badge.bg, 
                            fontWeight: 700, 
                            fontSize: '11px', 
                            padding: '3px 8px', 
                            borderRadius: '12px',
                            border: `1px solid ${badge.color}33`
                          }}>
                            {badge.text}
                          </span>
                        </div>

                        {/* Thước đo tuyến tính phân bố điểm đo (Visual Gauge Bar) */}
                        <div style={{ marginBottom: '16px', marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>
                            <span>Min: {min.toFixed(2)} ppm</span>
                            <span>Max: {max.toFixed(2)} ppm</span>
                          </div>
                          <div style={{ 
                            position: 'relative', 
                            height: '8px', 
                            background: 'linear-gradient(to right, #3b82f6, #10b981, #ef4444)', 
                            borderRadius: '4px' 
                          }}>
                            {/* Marker chỉ định giá trị trung bình */}
                            <div style={{
                              position: 'absolute',
                              left: `${avgPercent}%`,
                              top: '-4px',
                              transform: 'translateX(-50%)',
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              backgroundColor: '#fff',
                              border: '3px solid var(--color-text-primary)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              cursor: 'pointer',
                              zIndex: 2
                            }} title={`Mean: ${mean.toFixed(2)} ppm`} />
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                            Giá trị trung bình nằm ở vị trí <strong>{avgPercent.toFixed(1)}%</strong> trong dải phân bố
                          </div>
                        </div>

                        {/* Các chỉ số phụ */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Dải biến thiên (Span)</span>
                            <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{range.toFixed(2)} ppm</strong>
                          </div>
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Tổng số điểm đo thực tế</span>
                            <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                              {activeDetail.total_soundings ? activeDetail.total_soundings.toLocaleString() : 'N/A'}
                            </strong>
                          </div>
                        </div>
                        
                        {/* Ghi chú khoa học */}
                        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '10px', fontStyle: 'italic', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                          <i className="fa fa-info-circle" style={{ marginTop: '2px', color: 'var(--color-accent-primary)' }}></i>
                          <span>
                            Dữ liệu thống kê dựa trên tất cả soundings đo được từ cột khí dry-air CO2 và đã qua kiểm tra chất lượng vệ tinh.
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px 10px', 
                    color: 'var(--color-text-secondary)', 
                    background: '#f8fafc', 
                    border: '1px dashed #cbd5e1', 
                    borderRadius: '8px' 
                  }}>
                    <i className="fa fa-exclamation-triangle" style={{ fontSize: '20px', color: '#d97706', marginBottom: '6px', display: 'block' }}></i>
                    <span>Thống kê XCO2 chưa được tính toán (Tệp chưa kiểm định hoặc dữ liệu chưa được nạp đầy đủ).</span>
                  </div>
                )}
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

export default SourceList;
