// frontend/src/wind_management/hooks/useGridDataPage.ts
import { useState, useEffect, useMemo } from 'react';
import { useWindStore } from '../stores/useWindStore';
import { windApi } from '../services/windApi';
import type { GridSummaryData, Dataset } from '../../types/wind.types';

/** Phân tích ISO string thành các phần UTC */
const getUtcParts = (isoString: string) => {
  const d = new Date(isoString);
  return {
    year: d.getUTCFullYear().toString(),
    month: (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    day: d.getUTCDate().toString().padStart(2, '0'),
    hour: d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0'),
  };
};

export interface VariableCombo {
  value: string;
  label: string;
}

export function useGridDataPage() {
  const {
    activeGridLayers, setCurrentTime, selectedDatasetId, setSelectedDatasetId,
    setDatasetVariables, datasetVariables, setActiveGridLayers,
  } = useWindStore();

  const [summary, setSummary] = useState<GridSummaryData | null>(null);
  const [datasetsList, setDatasetsList] = useState<Dataset[]>([]);
  const [timeSteps, setTimeSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedHour, setSelectedHour] = useState('');

  const parsedTimes = useMemo(() => timeSteps.map(t => ({ ...getUtcParts(t), original: t })), [timeSteps]);

  const availableYears = useMemo(() => [...new Set(parsedTimes.map(p => p.year))].sort(), [parsedTimes]);
  const availableMonths = useMemo(() =>
    [...new Set(parsedTimes.filter(p => p.year === selectedYear).map(p => p.month))].sort(),
    [parsedTimes, selectedYear]);
  const availableDays = useMemo(() =>
    [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth).map(p => p.day))].sort(),
    [parsedTimes, selectedYear, selectedMonth]);
  const availableHours = useMemo(() =>
    [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth && p.day === selectedDay).map(p => p.hour))].sort(),
    [parsedTimes, selectedYear, selectedMonth, selectedDay]);

  /** Gom cặp u/v thành một combo item */
  const variableCombos: VariableCombo[] = useMemo(() => {
    const combos: VariableCombo[] = [];
    const processed = new Set<string>();
    datasetVariables.forEach(v => {
      const code = v.variable_code;
      if (processed.has(code)) return;
      if (code.startsWith('u')) {
        const companion = `v${code.slice(1)}`;
        if (datasetVariables.some(x => x.variable_code === companion)) {
          combos.push({ value: `${code},${companion}`, label: `Trường gió ${code.slice(1)} (${code} & ${companion})` });
          processed.add(code); processed.add(companion); return;
        }
      } else if (code.startsWith('v')) {
        const companion = `u${code.slice(1)}`;
        if (datasetVariables.some(x => x.variable_code === companion)) {
          combos.push({ value: `${companion},${code}`, label: `Trường gió ${code.slice(1)} (${companion} & ${code})` });
          processed.add(code); processed.add(companion); return;
        }
      }
      combos.push({ value: code, label: `${v.variable_name} (${code})` });
      processed.add(code);
    });
    return combos;
  }, [datasetVariables]);

  // --- Initial data load ---
  useEffect(() => {
    if (activeGridLayers.length === 0) setActiveGridLayers(['u10m', 'v10m']);
    setLoading(true);
    setError(null);

    windApi.getGridSummary().then(setSummary).catch(console.error);
    windApi.getDatasets().then(results => {
      setDatasetsList(results);
      if (results.length > 0) setSelectedDatasetId(results[0].id);
      setLoading(false);
    }).catch(err => {
      console.error('Error fetching datasets:', err);
      setError('Không thể tải danh sách bộ dữ liệu.');
      setLoading(false);
    });
  }, []);

  // --- Fetch time steps & variables khi dataset thay đổi ---
  useEffect(() => {
    if (!selectedDatasetId) return;
    setCurrentTime(null);
    windApi.getDatasetTimeSteps(selectedDatasetId).then(setTimeSteps).catch(console.error);
    windApi.getDatasetVariables(selectedDatasetId).then(setDatasetVariables).catch(console.error);
  }, [selectedDatasetId]);

  // --- Default variable khi variables thay đổi ---
  useEffect(() => {
    if (variableCombos.length > 0) {
      const isValid = activeGridLayers.some(l => datasetVariables.some(v => v.variable_code === l));
      if (!isValid) setActiveGridLayers(variableCombos[0].value.split(','));
    }
  }, [variableCombos, datasetVariables]);

  // --- Đặt defaults khi timeSteps thay đổi ---
  useEffect(() => {
    if (timeSteps.length === 0) {
      setSelectedYear(''); setSelectedMonth(''); setSelectedDay(''); setSelectedHour('');
      return;
    }
    const first = getUtcParts(timeSteps[0]);
    setSelectedYear(first.year); setSelectedMonth(first.month);
    setSelectedDay(first.day); setSelectedHour(first.hour);
  }, [timeSteps]);

  // --- Sync currentTime lên store ---
  useEffect(() => {
    if (!selectedYear || !selectedMonth || !selectedDay || !selectedHour) return;
    const matched = parsedTimes.find(p =>
      p.year === selectedYear && p.month === selectedMonth &&
      p.day === selectedDay && p.hour === selectedHour
    );
    if (matched) setCurrentTime(matched.original);
  }, [selectedYear, selectedMonth, selectedDay, selectedHour, timeSteps]);

  // --- Cascade date handlers ---
  const handleYearChange = (yr: string) => {
    setSelectedYear(yr);
    const months = [...new Set(parsedTimes.filter(p => p.year === yr).map(p => p.month))].sort();
    const m = months[0] || '';
    setSelectedMonth(m);
    const days = [...new Set(parsedTimes.filter(p => p.year === yr && p.month === m).map(p => p.day))].sort();
    const d = days[0] || '';
    setSelectedDay(d);
    const hours = [...new Set(parsedTimes.filter(p => p.year === yr && p.month === m && p.day === d).map(p => p.hour))].sort();
    setSelectedHour(hours[0] || '');
  };

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    const days = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === m).map(p => p.day))].sort();
    const d = days[0] || '';
    setSelectedDay(d);
    const hours = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === m && p.day === d).map(p => p.hour))].sort();
    setSelectedHour(hours[0] || '');
  };

  const handleDayChange = (d: string) => {
    setSelectedDay(d);
    const hours = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth && p.day === d).map(p => p.hour))].sort();
    setSelectedHour(hours[0] || '');
  };

  return {
    // State
    summary, datasetsList, loading, error, variableCombos,
    activeGridLayers, selectedDatasetId, datasetVariables,
    selectedYear, selectedMonth, selectedDay, selectedHour,
    availableYears, availableMonths, availableDays, availableHours,
    // Actions
    setSelectedDatasetId,
    setActiveGridLayers,
    setSelectedHour,
    handleYearChange,
    handleMonthChange,
    handleDayChange,
  };
}
