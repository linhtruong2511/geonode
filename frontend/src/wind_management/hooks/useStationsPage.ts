// frontend/src/wind_management/hooks/useStationsPage.ts
import { useState, useEffect } from 'react';
import { windApi } from '../services/windApi';
import { useMapStore } from '@common/stores/useMapStore';
import { useWindStore } from '../stores/useWindStore';
import type { StationListItem as Station } from '../../types/wind.types';

export function useStationsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    setIsPickingLocation, pickedLocation, setPickedLocation,
    scanRadius, setScanRadius, isScanning, setIsScanning,
    setMapData, setMapCenter, setMapZoom, setFocusedId
  } = useMapStore();

  const { setSelectedStationId, showStations, setShowStations } = useWindStore();

  const [stationTypeFilter, setStationTypeFilter] = useState<string>('');
  const [windSpeedFilter, setWindSpeedFilter] = useState<string>('');
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    setIsPickingLocation(true);
    setMapData([]);
    if (!showStations) setShowStations(true);
    return () => {
      setIsPickingLocation(false);
      setPickedLocation(null);
      setIsScanning(false);
    };
  }, []);

  const handleScan = () => {
    if (!pickedLocation) return;
    setIsScanning(true);
    setLoading(true);
    setError(null);

    // Giả lập radar delay (tương tự như code cũ)
    setTimeout(() => {
      windApi.spatialQueryStations({
        lat: pickedLocation[0],
        lon: pickedLocation[1],
        radius_km: scanRadius,
      })
      .then((features: any[]) => {
        let parsedStations: Station[] = features.map(f => ({
          id: f.id,
          name: f.properties.name,
          station_code: f.properties.station_code,
          elevation: f.properties.elevation,
          station_type: f.properties.station_type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          latest_observation: f.properties.latest_observation,
          wind_speed: f.properties.latest_observation?.wind_speed ?? 0,
          wind_dir: f.properties.latest_observation?.wind_dir ?? 180,
        }));

        if (stationTypeFilter) {
          parsedStations = parsedStations.filter(s => s.station_type === stationTypeFilter);
        }
        if (windSpeedFilter) {
          const speedVal = parseFloat(windSpeedFilter);
          parsedStations = parsedStations.filter(s => (s.wind_speed || 0) >= speedVal);
        }

        setStations(parsedStations);
        setMapData(parsedStations);
        setHasScanned(true);
        setIsScanning(false);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error spatial query stations:', err);
        setError('Không thể thực hiện quét trạm quan trắc.');
        setIsScanning(false);
        setLoading(false);
      });
    }, 1500);
  };

  const handleClearScan = () => {
    setPickedLocation(null);
    setStations([]);
    setMapData([]);
    setHasScanned(false);
    setStationTypeFilter('');
    setWindSpeedFilter('');
  };

  const handleLocateStation = (station: Station) => {
    setMapCenter([station.lat, station.lon]);
    setMapZoom(12);
    setFocusedId(station.id);
    setSelectedStationId(station.id);
  };

  return {
    stations, loading, error,
    pickedLocation, scanRadius, setScanRadius, isScanning,
    stationTypeFilter, setStationTypeFilter,
    windSpeedFilter, setWindSpeedFilter,
    hasScanned,
    handleScan, handleClearScan, handleLocateStation,
  };
}
