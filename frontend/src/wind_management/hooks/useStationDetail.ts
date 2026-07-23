// frontend/src/wind_management/hooks/useStationDetail.ts
import { useState, useEffect } from 'react';
import { windApi } from '../services/windApi';
import type { StationDetail, Observation, ViewMode } from '../../types/wind.types';

/** Chuẩn hóa response từ API (GeoJSON hoặc plain) thành StationDetail */
export function normalizeStation(data: any): StationDetail | null {
  if (!data) return null;
  if (data.properties) {
    return {
      id: data.id || data.properties.id,
      station_code: data.properties.station_code,
      name: data.properties.name,
      elevation: data.properties.elevation,
      station_type: data.properties.station_type,
      is_active: data.properties.is_active,
      dataset_code: data.properties.dataset_code,
      geometry: data.geometry,
      properties: data.properties,
      latest_observation: data.properties.latest_observation,
    };
  }
  const geometry = data.geometry || (data.lon !== undefined && data.lat !== undefined
    ? { type: 'Point', coordinates: [Number(data.lon), Number(data.lat)] }
    : undefined);
  return { ...data, geometry };
}

export function useStationDetail(id: string | undefined, stationProp?: StationDetail) {
  const [station, setStation] = useState<StationDetail | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [summaryResults, setSummaryResults] = useState<any[]>([]);
  const [loadingStation, setLoadingStation] = useState(true);
  const [loadingObs, setLoadingObs] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('yearly');
  const [variable, setVariable] = useState('wind_speed');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');

  // --- Load station ---
  useEffect(() => {
    if (stationProp) { setStation(normalizeStation(stationProp)); setLoadingStation(false); return; }
    if (!id) return;
    setLoadingStation(true);
    windApi.getStation(id)
      .then(data => { setStation(normalizeStation(data)); setLoadingStation(false); })
      .catch(err => { console.error('Error fetching station details:', err); setError('Không thể tải thông tin trạm quan trắc.'); setLoadingStation(false); });
  }, [id, stationProp]);

  // --- Load raw observations ---
  useEffect(() => {
    if (!id || viewMode !== 'raw') return;
    setLoadingObs(true);
    const params: any = { station: id, page_size: 200 };
    if (startTime) params.start_time = new Date(startTime).toISOString();
    if (endTime) params.end_time = new Date(endTime).toISOString();
    windApi.getObservations(params)
      .then(data => { setObservations([...data].sort((a, b) => new Date(a.obs_time).getTime() - new Date(b.obs_time).getTime())); setLoadingObs(false); })
      .catch(err => { console.error('Error fetching observations:', err); setLoadingObs(false); });
  }, [id, startTime, endTime, viewMode]);

  // --- Load summary (monthly/yearly) ---
  useEffect(() => {
    if (!id || viewMode === 'raw') return;
    setLoadingSummary(true);
    const endpoint = viewMode === 'monthly' ? 'monthly-summary' : 'yearly-summary';
    const params: Record<string, string> = {};
    if (viewMode === 'monthly') {
      if (startMonth) params.start_date = `${startMonth}-01T00:00:00Z`;
      if (endMonth) params.end_date = `${endMonth}-28T23:59:59Z`;
    } else {
      if (startYear) params.start_date = `${startYear}-01-01T00:00:00Z`;
      if (endYear) params.end_date = `${endYear}-12-31T23:59:59Z`;
    }
    windApi.getStationSummary(id, endpoint, params)
      .then(data => { setSummaryResults(data); setLoadingSummary(false); })
      .catch(err => { console.error(`Error fetching ${viewMode} summary:`, err); setLoadingSummary(false); });
  }, [id, viewMode, startMonth, endMonth, startYear, endYear]);

  return {
    station, observations, summaryResults,
    loadingStation, loadingObs, loadingSummary, error,
    viewMode, setViewMode,
    variable, setVariable,
    startTime, setStartTime, endTime, setEndTime,
    startMonth, setStartMonth, endMonth, setEndMonth,
    startYear, setStartYear, endYear, setEndYear,
  };
}
