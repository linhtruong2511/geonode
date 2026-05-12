import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationFormData {
  name: string;
  description: string;
  location_type: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  is_active: boolean;
}

const LocationPicker: React.FC<{
  position: [number, number];
  setPosition: (pos: [number, number]) => void;
}> = ({ position, setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position ? <Marker position={position} /> : null;
};

const LocationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    description: '',
    location_type: 'Point',
    latitude: 21.0285, // Default Hanoi
    longitude: 105.8542,
    radius_km: 10,
    is_active: true,
  });
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      const fetchLocation = async () => {
        try {
          const response = await axios.get(`/co2/api/v1/locations/${id}/`);
          setFormData(response.data);
        } catch (err: any) {
          setError('Không thể tải thông tin vị trí');
        } finally {
          setLoading(false);
        }
      };
      fetchLocation();
    }
  }, [id, isEditing]);

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

  if (loading) return <div>Đang tải...</div>;

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>{isEditing ? 'Sửa Vị trí giám sát' : 'Thêm Vị trí giám sát mới'}</h3>
        </div>
        <div>
          <Link to="/locations" className="btn btn-sm btn-outline-secondary" style={{ padding: '8px 16px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', textDecoration: 'none' }}>
            <i className="fa fa-arrow-left"></i> Quay lại
          </Link>
        </div>
      </div>

      {error && <div style={{ padding: '16px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Form bên trái */}
        <div className="co2-card">
          <div className="co2-card-header">
            Thông tin cơ bản
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
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Loại</label>
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
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Bán kính theo dõi (km)</label>
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
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                    step="0.00001"
                    readOnly
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: '#f8fafc' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Kinh độ (Longitude)</label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                    step="0.00001"
                    readOnly
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: '#f8fafc' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                    style={{ marginRight: '8px', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: 600 }}>Đang hoạt động (Kích hoạt thu thập dữ liệu)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <Link to="/locations" className="btn" style={{ padding: '10px 20px', border: '1px solid var(--color-border)', borderRadius: '6px', textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                  Hủy
                </Link>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '10px 20px', background: 'var(--color-accent-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Đang lưu...' : (isEditing ? 'Cập nhật' : 'Thêm mới')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Bản đồ bên phải */}
        <div className="co2-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="co2-card-header">
            Chọn vị trí trên bản đồ
          </div>
          <div className="co2-card-body" style={{ padding: 0, flex: 1, minHeight: '400px' }}>
            <MapContainer
              center={[formData.latitude, formData.longitude]}
              zoom={6}
              style={{ height: '100%', width: '100%', borderRadius: '0 0 12px 12px' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationPicker 
                position={[formData.latitude, formData.longitude]} 
                setPosition={(pos) => setFormData(prev => ({...prev, latitude: pos[0], longitude: pos[1]}))} 
              />
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationForm;
