import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useMapStore } from '../../common/stores/useMapStore';

interface LocationFormData {
  name: string;
  description: string;
  location_type: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  is_active: boolean;
}

const LocationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  
  const { 
    setShowMap, setMapCenter, setMapZoom, 
    setIsPickingLocation, pickedLocation, setPickedLocation 
  } = useMapStore();

  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    description: '',
    location_type: 'Point',
    latitude: 16.047, 
    longitude: 108.206,
    radius_km: 10,
    is_active: true,
  });
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form data with store's picked location
  useEffect(() => {
    if (pickedLocation) {
      setFormData(prev => ({
        ...prev,
        latitude: pickedLocation[0],
        longitude: pickedLocation[1]
      }));
    }
  }, [pickedLocation]);

  // Activate map and picking mode when component mounts
  useEffect(() => {
    setShowMap(true);
    setIsPickingLocation(true);
    
    if (!isEditing) {
      setMapCenter([16.047, 108.206]);
      setMapZoom(6);
      setPickedLocation([16.047, 108.206]);
    }

    return () => {
      setShowMap(false);
      setIsPickingLocation(false);
      setPickedLocation(null);
    };
  }, [setShowMap, setIsPickingLocation, setMapCenter, setMapZoom, setPickedLocation, isEditing]);

  useEffect(() => {
    if (isEditing) {
      const fetchLocation = async () => {
        try {
          const response = await axios.get(`/co2/api/v1/locations/${id}/`);
          const data = response.data;
          setFormData(data);
          setMapCenter([data.latitude, data.longitude]);
          setMapZoom(10);
          setPickedLocation([data.latitude, data.longitude]);
        } catch (err: any) {
          setError('Không thể tải thông tin vị trí');
        } finally {
          setLoading(false);
        }
      };
      fetchLocation();
    }
  }, [id, isEditing, setMapCenter, setMapZoom, setPickedLocation]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : (type === 'number' ? parseFloat(value) : value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // CSRF token retrieval for Django
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
    
    const headers = { 'X-CSRFToken': getCookie('csrftoken') };

    try {
      if (isEditing) {
        await axios.put(`/co2/api/v1/locations/${id}/`, formData, { headers });
      } else {
        await axios.post('/co2/api/v1/locations/', formData, { headers });
      }
      navigate('/locations');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Đã có lỗi xảy ra khi lưu');
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Đang tải...</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="co2-page-title">
        <div>
          <h3>{isEditing ? 'Sửa Vị trí giám sát' : 'Thêm Vị trí giám sát mới'}</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            <i className="fa fa-info-circle"></i> Bạn hãy click trực tiếp trên bản đồ bên trái để chọn tọa độ vị trí.
          </p>
        </div>
        <div>
          <Link to="/locations" className="btn btn-sm btn-outline-secondary" style={{ padding: '8px 16px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', textDecoration: 'none' }}>
            <i className="fa fa-arrow-left"></i> Quay lại
          </Link>
        </div>
      </div>

      {error && <div style={{ padding: '16px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <div className="co2-card">
        <div className="co2-card-header">
          Thông tin chi tiết
        </div>
        <div className="co2-card-body">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Tên vị trí *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Ví dụ: Thành phố Đà Nẵng, Nhà máy nhiệt điện..."
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Mô tả</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Thông tin bổ sung về vị trí này..."
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Loại vị trí</label>
                <select
                  name="location_type"
                  value={formData.location_type}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                >
                  <option value="Point">Điểm phát thải (Point)</option>
                  <option value="City">Thành phố (City)</option>
                  <option value="Region">Khu vực (Region)</option>
                  <option value="Forest">Rừng (Forest)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Bán kính quan tâm (km)</label>
                <input
                  type="number"
                  name="radius_km"
                  value={formData.radius_km}
                  onChange={handleChange}
                  min="1"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                />
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Vĩ độ (Latitude)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude.toFixed(6)}
                    onChange={handleChange}
                    step="0.000001"
                    readOnly
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b' }}>
                    <i className="fa fa-map-marker"></i>
                  </span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Kinh độ (Longitude)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude.toFixed(6)}
                    onChange={handleChange}
                    step="0.000001"
                    readOnly
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b' }}>
                    <i className="fa fa-map-marker"></i>
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{ marginRight: '10px', width: '20px', height: '20px' }}
                />
                <div>
                  <span style={{ fontWeight: 700, display: 'block' }}>Kích hoạt vị trí này</span>
                  <span style={{ fontSize: '12px', color: '#0369a1' }}>Hệ thống sẽ tự động thu thập dữ liệu XCO2 trong bán kính đã chọn.</span>
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
              <Link to="/locations" className="btn" style={{ padding: '10px 24px', border: '1px solid var(--color-border)', borderRadius: '6px', textDecoration: 'none', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                Hủy
              </Link>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '10px 24px', background: 'var(--color-accent-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: saving ? 0.7 : 1, fontWeight: 700, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                {saving ? (
                  <><i className="fa fa-spinner fa-spin"></i> Đang lưu...</>
                ) : (
                  <><i className="fa fa-save"></i> {isEditing ? 'Cập nhật' : 'Lưu vị trí'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LocationForm;
