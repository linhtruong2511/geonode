import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface FetchParams {
  page?: number;
  pageSize?: number;
  search?: string;
  ordering?: string;
  [key: string]: any;
}

interface FetchResult<T> {
  data: T[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useFetchData<T>(url: string, params: FetchParams = {}): FetchResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(url, {
        params: {
          limit: params.pageSize,
          offset: params.page && params.pageSize ? (params.page - 1) * params.pageSize : 0,
          search: params.search,
          ordering: params.ordering,
          ...params
        }
      });
      
      // DRF with LimitOffsetPagination returns { results: [], count: 0 }
      if (response.data && response.data.results) {
        setData(response.data.results);
        setTotalCount(response.data.count);
      } else {
        setData(response.data);
        setTotalCount(response.data.length || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(params)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, totalCount, loading, error, refresh: fetchData };
}
