// frontend/src/types/wind.types.ts

export interface StationGeometry {
  type: string;
  coordinates: [number, number];
}

export interface LatestObservation {
  obs_time: string;
  wind_speed: number | null;
  wind_dir: number | null;
  temp_2m: number | null;
  humidity: number | null;
  pressure: number | null;
}

/** Station model được dùng trong StationsPage (list view - spatial query result) */
export interface StationListItem {
  id: number;
  name: string;
  station_code: string;
  elevation: number;
  station_type: string;
  lat: number;
  lon: number;
  latest_observation?: LatestObservation;
  wind_speed?: number;
  wind_dir?: number;
}

/** Station model được dùng trong StationDetailPage (có geometry từ GeoJSON API) */
export interface StationDetail {
  id: number;
  station_code: string;
  name: string;
  elevation: string | number | null;
  station_type: string;
  is_active: boolean;
  dataset_code: string;
  geometry?: StationGeometry;
  properties?: {
    latest_observation?: LatestObservation;
    [key: string]: any;
  };
  latest_observation?: LatestObservation;
}

export interface Observation {
  id: number;
  obs_time: string;
  wind_speed: number | null;
  wind_dir: number | null;
  temp_2m: number | null;
  humidity: number | null;
  pressure: number | null;
  rain_06h: number | null;
  rain_24h: number | null;
}

export interface DatasetSummary {
  dataset_code: string;
  dataset_name: string;
  count: number;
}

export interface GridSummaryData {
  total_granules: number;
  min_granule_time: string | null;
  max_granule_time: string | null;
  datasets: DatasetSummary[];
  unique_variable_codes: string[];
}

export interface DatasetVariable {
  variable_code: string;
  variable_name: string;
}

export interface Dataset {
  id: number | string;
  name: string;
  code: string;
}

export type ViewMode = 'raw' | 'monthly' | 'yearly';
