// frontend/src/wind_management/services/windApi.ts
import axios from 'axios';
import type {
  GridSummaryData,
  Dataset,
  DatasetVariable,
  Observation,
  StationDetail,
} from '../../types/wind.types';

const BASE = '/wind/api/v1';

export const windApi = {
  /** Lấy tổng quan raster granules */
  getGridSummary: () =>
    axios.get<GridSummaryData>(`${BASE}/raster-granules/summary/`).then(r => r.data),

  /** Lấy danh sách datasets theo category */
  getDatasets: (category = 'GRIDDED') =>
    axios.get<{ results?: Dataset[] }>(`${BASE}/datasets/`, { params: { category } })
      .then(r => r.data.results || (r.data as any) as Dataset[]),

  /** Lấy time steps của một dataset */
  getDatasetTimeSteps: (datasetId: number | string) =>
    axios.get<{ time_steps: string[] }>(`${BASE}/datasets/${datasetId}/time_steps/`)
      .then(r => r.data.time_steps || []),

  /** Lấy danh sách variables của dataset */
  getDatasetVariables: (datasetId: number | string) =>
    axios.get<{ variables: DatasetVariable[] }>(`${BASE}/datasets/${datasetId}/get_variables/`)
      .then(r => r.data.variables || []),

  /** Lấy chi tiết 1 trạm */
  getStation: (id: string | number) =>
    axios.get<StationDetail>(`${BASE}/stations/${id}/`).then(r => r.data),

  /** Lấy dữ liệu quan trắc (raw) */
  getObservations: (params: {
    station: string | number;
    page_size?: number;
    start_time?: string;
    end_time?: string;
  }) =>
    axios.get<{ results?: Observation[] }>(`${BASE}/observations/`, { params })
      .then(r => (r.data.results || (r.data as any)) as Observation[]),

  /** Lấy monthly-summary hoặc yearly-summary của trạm */
  getStationSummary: (
    id: string | number,
    mode: 'monthly-summary' | 'yearly-summary',
    params: Record<string, string>
  ) =>
    axios.get<{ results: any[] }>(`${BASE}/stations/${id}/${mode}/`, { params })
      .then(r => r.data.results || []),

  /** Spatial query: lấy trạm trong vùng */
  spatialQueryStations: (params: { lat: number; lon: number; radius_km: number }) =>
    axios.get(`${BASE}/stations/spatial_query/`, { params })
      .then(r => r.data.results?.features || r.data.features || []),

  /** Fetch raw raster granules data (u and v grids) */
  getRasterGranulesData: (params: { time: string; bbox: string; step?: number; u?: string; v?: string }) =>
    axios.get(`${BASE}/raster-granules/data/`, { params })
      .then(r => r.data),
};
