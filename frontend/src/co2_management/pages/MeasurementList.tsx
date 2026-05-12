import React, { useState, useEffect, useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
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

const columnHelper = createColumnHelper<Measurement>();

const MeasurementList: React.FC = () => {
  const { setShowMap, setMapData, setMapCenter, setMapZoom, mapBounds, isSpatialSearchEnabled } = useMapStore();
  
  const [filters, setFilters] = useState({
    source: '',
    quality: '',
    min_xco2: '',
    max_xco2: '',
    date_from: '',
    date_to: '',
  });

  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 500,
  });

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  // Activate map when this component mounts, hide when unmounts
  useEffect(() => {
    setShowMap(true);
    setMapCenter([16.047079, 108.206230]);
    setMapZoom(5);
    return () => {
      setShowMap(false);
      setMapData([]);
    };
  }, [setShowMap, setMapCenter, setMapZoom, setMapData]);

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

    // Spatial filter
    if (isSpatialSearchEnabled && mapBounds) {
      params.min_lat = mapBounds.south;
      params.max_lat = mapBounds.north;
      params.min_lon = mapBounds.west;
      params.max_lon = mapBounds.east;
    }

    return params;
  }, [pageIndex, pageSize, filters, isSpatialSearchEnabled, mapBounds]);

  const { data, totalCount, loading } = useFetchData<Measurement>('/co2/api/v1/measurements/', fetchParams);

  // Update map data whenever data changes
  useEffect(() => {
    setMapData(data);
  }, [data, setMapData]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, pageIndex: 0 })); // Reset page on filter change
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('measurement_time', {
        header: 'Thời gian',
        cell: info => new Date(info.getValue()).toLocaleString('vi-VN'),
      }),
      columnHelper.accessor('latitude', {
        header: 'Vĩ độ',
        cell: info => info.getValue().toFixed(4),
      }),
      columnHelper.accessor('longitude', {
        header: 'Kinh độ',
        cell: info => info.getValue().toFixed(4),
      }),
      columnHelper.accessor('xco2_ppm', {
        header: 'Nồng độ XCO2 (ppm)',
        cell: info => <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)' }}>{info.getValue().toFixed(2)}</span>,
      }),
      columnHelper.accessor('xco2_quality_flag', {
        header: 'Chất lượng',
        cell: info => {
          const flag = info.getValue();
          if (flag === 0) return <span style={{ color: '#059669', fontSize: '12px', fontWeight: 600, backgroundColor: '#d1fae5', padding: '4px 8px', borderRadius: '4px' }}>Tốt</span>;
          return <span style={{ color: '#d97706', fontSize: '12px', fontWeight: 600, backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '4px' }}>Kém</span>;
        },
      }),
      columnHelper.accessor('data_source', {
        header: 'Nguồn',
        cell: info => info.getValue(),
      }),
    ],
    []
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Dữ liệu đo lường XCO2</h3>
          <p>Truy vấn và xem chi tiết dữ liệu từ các vệ tinh theo không gian và thời gian</p>
        </div>
      </div>

      <div className="co2-card" style={{ marginBottom: '20px' }}>
        <div className="co2-card-header">
          <i className="fa fa-filter"></i> Bộ lọc nâng cao
        </div>
        <div className="co2-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Vệ tinh</label>
              <select name="source" value={filters.source} onChange={handleFilterChange} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <option value="">-- Tất cả --</option>
                <option value="OCO2">OCO-2</option>
                <option value="GOSAT2">GOSAT-2</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Chất lượng dữ liệu</label>
              <select name="quality" value={filters.quality} onChange={handleFilterChange} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <option value="">-- Tất cả --</option>
                <option value="0">Tốt (Quality Flag = 0)</option>
                <option value="1">Kém (Quality Flag != 0)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>XCO2 Min (ppm)</label>
              <input type="number" name="min_xco2" value={filters.min_xco2} onChange={handleFilterChange} placeholder="Ví dụ: 400" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>XCO2 Max (ppm)</label>
              <input type="number" name="max_xco2" value={filters.max_xco2} onChange={handleFilterChange} placeholder="Ví dụ: 420" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Từ ngày</label>
              <input type="date" name="date_from" value={filters.date_from} onChange={handleFilterChange} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Đến ngày</label>
              <input type="date" name="date_to" value={filters.date_to} onChange={handleFilterChange} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }} />
            </div>
          </div>
        </div>
      </div>

      <ReactTable
        data={data}
        columns={columns}
        pageCount={pageCount}
        pagination={pagination}
        setPagination={setPagination}
        isLoading={loading}
      />
    </div>
  );
};

export default MeasurementList;
