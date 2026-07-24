import React, { useState, useEffect, useMemo } from 'react';
import { useFetchData } from '@common/hooks/useFetchData';
import axios from 'axios';
import { useMapStore } from '../../common/stores/useMapStore';

export interface Station {
  id: string;
  code: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  measurement_count?: number;
  latest_measurement_at?: string;
  available_pollutants?: string[];
}

const StationList: React.FC = () => {
  // Lấy các hàm điều khiển bản đồ từ Store dùng chung
  const { setShowMap, setMapData, setMapCenter, setMapZoom, setFocusedId } = useMapStore();

  // Quản lý phân trang
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Bộ lọc tìm kiếm trạm
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    has_data: '',
    bbox: '',
  });

  // State hỗ trợ tải lại danh sách
  const [refetchKey, setRefetchKey] = useState(0);

  // State quản lý chọn nhiều bản ghi
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // State hiển thị chi tiết của một trạm (Modal)
  const [activeDetail, setActiveDetail] = useState<Station | null>(null);

  // State phục vụ việc Import file CSV danh mục trạm
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  // Tham số gửi lên API
  const fetchParams = useMemo(() => {
    const params: any = {
      page: pageIndex + 1,
      pageSize: pageSize,
      _refetch: refetchKey,
    };

    if (filters.search) params.search = filters.search;
    if (filters.status !== '') params.status = filters.status;
    if (filters.has_data !== '') params.has_data = filters.has_data;
    if (filters.bbox) params.bbox = filters.bbox;

    return params;
  }, [pageIndex, pageSize, filters, refetchKey]);

  // Lấy dữ liệu thông qua hook dùng chung
  const { data, totalCount, loading } = useFetchData<Station>('/co2/api/v1/aq-stations/', fetchParams);

  // Kích hoạt bản đồ khi mở trang
  useEffect(() => {
    setShowMap(true);
    setMapCenter([21.028511, 105.804817]);
    setMapZoom(8);
    return () => {
      setMapData([]);
      setFocusedId(null);
    };
  }, [setShowMap, setMapCenter, setMapZoom, setMapData, setFocusedId]);

  // Cập nhật dữ liệu bản đồ khi danh sách trạm thay đổi
  useEffect(() => {
    if (data && data.length > 0) {
      setMapData(data);
    }
  }, [data, setMapData]);

  // Reset danh sách được chọn khi phân trang hoặc thay đổi bộ lọc
  useEffect(() => {
    setSelectedIds([]);
  }, [pageIndex, pageSize, filters, refetchKey]);

  // Lấy CSRF token từ cookie
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

  // Xử lý thay đổi các ô nhập bộ lọc
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  };

  // Chọn hoặc bỏ chọn một hàng
  const handleRowSelect = (id: string) => {
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

  // Định vị trạm trên bản đồ khi nhấn nút Target
  const handleTargetLocation = (item: Station) => {
    if (item.latitude !== undefined && item.latitude !== null && item.longitude !== undefined && item.longitude !== null) {
      setMapCenter([item.latitude, item.longitude]);
      setMapZoom(13);
      setFocusedId(typeof item.id === 'number' ? item.id : parseInt(String(item.id).slice(-8)) || 1);
    } else {
      alert(`Trạm "${item.name}" chưa có tọa độ kinh/vĩ độ để định vị!`);
    }
  };

  // Hiển thị các trạm được chọn (hoặc tất cả) lên bản đồ
  const handleBulkShowMap = () => {
    const selectedStations = selectedIds.length > 0 
      ? data.filter(item => selectedIds.includes(item.id))
      : data;

    if (selectedStations.length === 0) {
      alert("Không có trạm nào để hiển thị lên bản đồ!");
      return;
    }

    setMapData(selectedStations);

    const validFirst = selectedStations.find(s => s.latitude && s.longitude);
    if (validFirst && validFirst.latitude && validFirst.longitude) {
      setMapCenter([validFirst.latitude, validFirst.longitude]);
      setMapZoom(9);
    }

    alert(`Đã hiển thị ${selectedStations.length} trạm quan trắc lên bản đồ!`);
  };

  // Xóa một trạm đơn lẻ
  const handleSingleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa trạm quan trắc "${name}"?`)) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await axios.delete(`/co2/api/v1/aq-stations/${id}/`, { headers });
      setRefetchKey(prev => prev + 1);
      alert("Đã xóa trạm quan trắc thành công!");
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi xóa trạm quan trắc.");
    }
  };

  // Xóa hàng loạt trạm đã chọn
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} trạm đã chọn?`)) return;
    try {
      const headers = { 'X-CSRFToken': getCookie('csrftoken') };
      await Promise.all(
        selectedIds.map(id => axios.delete(`/co2/api/v1/aq-stations/${id}/`, { headers }))
      );
      setRefetchKey(prev => prev + 1);
      alert("Đã xóa các trạm quan trắc thành công!");
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi xóa các trạm quan trắc.");
    }
  };

  // Tải file mẫu CSV
  const handleDownloadTemplate = () => {
    window.open('/co2/api/v1/aq-stations/download_template/', '_blank');
  };

  // Xử lý chọn file CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
      setUploadStatus('');
    }
  };

  // Xử lý gửi form Import CSV
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert("Vui lòng chọn một file CSV danh mục trạm.");
      return;
    }

    setIsUploading(true);
    setUploadStatus("Đang nạp file CSV danh mục trạm...");

    try {
      const csrfToken = getCookie('csrftoken');
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await axios.post('/co2/api/v1/aq-stations/import_csv/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-CSRFToken': csrfToken,
        }
      });

      setImportResult(res.data);
      setUploadStatus(res.data.error || "Import danh mục trạm thành công!");
      setIsUploading(false);
      setRefetchKey(prev => prev + 1);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.response?.data?.message || "Lỗi khi import file CSV danh mục trạm.";
      setUploadStatus(`Lỗi: ${errMsg}`);
      if (err.response?.data) {
        setImportResult(err.response.data);
      }
      setIsUploading(false);
    }
  };

  const getStatusBadge = (statusNum: number) => {
    if (statusNum === 0) {
      return <span style={{ color: '#059669', fontSize: '10px', fontWeight: 600, backgroundColor: '#d1fae5', padding: '1px 6px', borderRadius: '3px' }}>Bình thường</span>;
    } else {
      return <span style={{ color: '#d97706', fontSize: '10px', fontWeight: 600, backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: '3px' }}>Bảo trì / Offline</span>;
    }
  };

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tiêu đề trang */}
      <div className="co2-page-title" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Quản lý trạm quan trắc không khí</h3>
          <p style={{ fontSize: '11px', margin: 0 }}>Danh sách danh mục các trạm quan trắc chất lượng không khí trên toàn quốc</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDownloadTemplate}
            style={{
              padding: '6px 12px',
              background: '#fff',
              color: 'var(--color-accent-primary)',
              border: '1px solid var(--color-accent-primary)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Tải tệp CSV mẫu nhập danh mục trạm"
          >
            <i className="fa fa-download"></i> Tải file mẫu
          </button>
          <button
            onClick={() => {
              setShowImportModal(true);
              setSelectedFile(null);
              setImportResult(null);
              setUploadStatus('');
            }}
            style={{
              padding: '6px 12px',
              background: 'var(--color-accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fa fa-file-text-o"></i> Import CSV
          </button>
        </div>
      </div>

      {/* Bộ lọc tìm kiếm */}
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Tìm kiếm</label>
            <input
              type="text"
              name="search"
              placeholder="Tên, mã trạm..."
              value={filters.search}
              onChange={handleFilterChange}
              style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Trạng thái</label>
            <select name="status" value={filters.status} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="0">Bình thường</option>
              <option value="4">Bảo trì / Offline</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Dữ liệu đo đạc</label>
            <select name="has_data" value={filters.has_data} onChange={handleFilterChange} style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <option value="">Tất cả</option>
              <option value="true">Có dữ liệu</option>
              <option value="false">Chưa có dữ liệu</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '2px', color: 'var(--color-text-secondary)' }}>Khung tọa độ (BBox)</label>
            <input
              type="text"
              name="bbox"
              placeholder="min_lon,min_lat,max_lon,max_lat"
              value={filters.bbox}
              onChange={handleFilterChange}
              style={{ width: '100%', padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      </div>

      {/* Thanh công cụ tác vụ hàng loạt */}
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
              Đang chọn: <strong>{selectedIds.length}</strong> trạm
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleBulkShowMap}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid #10b981',
              backgroundColor: '#fff',
              color: '#10b981',
              fontWeight: 600
            }}
            title="Hiện các trạm đã chọn lên bản đồ"
          >
            <i className="fa fa-globe"></i> Hiện bản đồ
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
            title="Xóa các trạm đã chọn"
          >
            <i className="fa fa-trash"></i> Xóa nhiều
          </button>
        </div>
      </div>

      {/* Danh sách các trạm */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
        {loading ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Đang tải danh sách trạm...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Không tìm thấy trạm quan trắc nào</div>
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
              {/* Thanh công cụ dòng */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '4px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => handleRowSelect(item.id)}
                  style={{ margin: 0, cursor: 'pointer' }}
                />
                {/* Nút i (Info) xem chi tiết trạm */}
                <i
                  className="fa fa-info-circle"
                  onClick={() => setActiveDetail(item)}
                  style={{ cursor: 'pointer', color: 'var(--color-accent-primary)', fontSize: '13px' }}
                  title="Xem thông tin chi tiết trạm quan trắc"
                ></i>
                {/* Nút Target định vị trạm trên bản đồ */}
                <i
                  className="fa fa-crosshairs"
                  onClick={() => handleTargetLocation(item)}
                  style={{ cursor: 'pointer', color: '#10b981', fontSize: '13px' }}
                  title="Định vị vị trí trạm trên bản đồ"
                ></i>
                {/* Nút Xóa trạm */}
                <i
                  className="fa fa-trash"
                  onClick={() => handleSingleDelete(item.id, item.name)}
                  style={{ cursor: 'pointer', color: '#ef4444', fontSize: '12px' }}
                  title="Xóa trạm quan trắc này"
                ></i>
                <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  ID: {item.id}
                </div>
              </div>

              {/* Thông tin chính của trạm */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  <span style={{ color: 'var(--color-accent-primary)', marginRight: '6px' }}>[{item.code || 'NO-CODE'}]</span>
                  {item.name}
                </div>
                <div>
                  {getStatusBadge(item.status)}
                </div>
              </div>

              {/* Thông tin phụ */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {item.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa fa-map-marker" style={{ fontSize: '11px' }}></i>
                    {item.address}
                  </div>
                )}
                {item.latitude && item.longitude && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa fa-compass" style={{ fontSize: '11px' }}></i>
                    Tọa độ: {item.latitude}, {item.longitude}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="fa fa-database" style={{ fontSize: '10px' }}></i>
                  Số bản ghi: {item.measurement_count ? item.measurement_count.toLocaleString() : 0}
                </div>
                {item.latest_measurement_at && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa fa-clock-o" style={{ fontSize: '10px' }}></i>
                    Đo gần nhất: {new Date(item.latest_measurement_at).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>

              {/* Danh sách các thông số ô nhiễm hỗ trợ */}
              {item.available_pollutants && item.available_pollutants.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {item.available_pollutants.map(p => (
                    <span key={p} style={{ fontSize: '9px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '3px', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                      {p.toUpperCase().replace('_', '.')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Điều khiển phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px' }}>
        <div>
          Tổng số trạm: <strong>{totalCount}</strong>
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

      {/* MODAL Xem chi tiết trạm quan trắc (Information Dialog) */}
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            width: '95%',
            maxWidth: '520px',
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
                Chi tiết trạm quan trắc
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '8px 15px', wordBreak: 'break-word', marginBottom: '15px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Mã định danh (ID):</span>
                <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{activeDetail.id}</strong>

                <span style={{ color: 'var(--color-text-secondary)' }}>Mã trạm (Code):</span>
                <strong style={{ color: 'var(--color-accent-primary)' }}>{activeDetail.code || 'N/A'}</strong>

                <span style={{ color: 'var(--color-text-secondary)' }}>Tên trạm:</span>
                <span style={{ fontWeight: 600 }}>{activeDetail.name}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Địa chỉ:</span>
                <span>{activeDetail.address || 'Chưa có thông tin'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Tọa độ Kinh/Vĩ độ:</span>
                <span>
                  {activeDetail.latitude && activeDetail.longitude
                    ? `${Number(activeDetail.latitude).toFixed(6)}, ${Number(activeDetail.longitude).toFixed(6)}`
                    : 'N/A'}
                </span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Trạng thái trạm:</span>
                <span>{getStatusBadge(activeDetail.status)}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Tổng số bản ghi đo:</span>
                <span>{activeDetail.measurement_count ? activeDetail.measurement_count.toLocaleString() : 0}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Thời gian đo gần nhất:</span>
                <span>{activeDetail.latest_measurement_at ? new Date(activeDetail.latest_measurement_at).toLocaleString('vi-VN') : 'Chưa có'}</span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Ngày khởi tạo:</span>
                <span>{activeDetail.created_at ? new Date(activeDetail.created_at).toLocaleString('vi-VN') : 'N/A'}</span>
              </div>

              {/* Phép đo hỗ trợ */}
              {activeDetail.available_pollutants && activeDetail.available_pollutants.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                  <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 700 }}>Thông số ô nhiễm trạm từng đo:</h5>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {activeDetail.available_pollutants.map(p => (
                      <span key={p} style={{ fontSize: '11px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {p.toUpperCase().replace('_', '.')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  handleTargetLocation(activeDetail);
                  setActiveDetail(null);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <i className="fa fa-crosshairs"></i> Định vị trên bản đồ
              </button>
              <button
                onClick={() => setActiveDetail(null)}
                style={{
                  padding: '6px 12px',
                  background: '#fff',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Import CSV Danh mục trạm */}
      {showImportModal && (
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            width: '95%',
            maxWidth: '480px',
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
                Import danh mục trạm quan trắc (CSV)
              </h4>
              <button
                onClick={() => setShowImportModal(false)}
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

            <form onSubmit={handleImportSubmit} style={{ padding: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Chọn file CSV trạm quan trắc:
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{ width: '100%', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  File CSV phải bao gồm các cột bắt buộc: <code>stationId</code>, <code>stationName</code>. Các cột khuyến nghị: <code>stationCode</code>, <code>address</code>, <code>latitude</code>, <code>longitude</code>, <code>status</code>.
                </p>
              </div>

              {uploadStatus && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  marginBottom: '12px',
                  background: uploadStatus.startsWith('Lỗi') ? '#fef2f2' : '#f0fdf4',
                  color: uploadStatus.startsWith('Lỗi') ? '#991b1b' : '#166534',
                  border: uploadStatus.startsWith('Lỗi') ? '1px solid #fecaca' : '1px solid #bbf7d0'
                }}>
                  {uploadStatus}
                </div>
              )}

              {importResult && importResult.success && (
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '11px', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
                  <div><strong>Tổng số dòng:</strong> {importResult.total_rows}</div>
                  <div style={{ color: '#059669' }}><strong>Tạo mới thành công:</strong> {importResult.created_count}</div>
                  <div style={{ color: '#0284c7' }}><strong>Cập nhật:</strong> {importResult.updated_count}</div>
                  {importResult.error_count > 0 && (
                    <div style={{ color: '#dc2626' }}><strong>Số dòng lỗi:</strong> {importResult.error_count}</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{
                    padding: '6px 12px',
                    background: '#fff',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--color-accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isUploading || !selectedFile ? 'not-allowed' : 'pointer',
                    opacity: isUploading || !selectedFile ? 0.6 : 1
                  }}
                >
                  {isUploading ? 'Đang import...' : 'Tải lên & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StationList;
