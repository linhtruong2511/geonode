import React, { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
import axios from 'axios';

interface MeasurementSource {
  id: number;
  name: string;
  source_type: string;
  upload_date: string;
  processed: boolean;
  file_size?: number;
  original_filename?: string;
  status?: string;
}

const columnHelper = createColumnHelper<MeasurementSource>();

const SourceList: React.FC = () => {
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const [refetchKey, setRefetchKey] = useState(0);

  const { data, totalCount, loading } = useFetchData<MeasurementSource>('/co2/api/v1/sources/', {
    page: pageIndex + 1,
    pageSize: pageSize,
    _refetch: refetchKey,
  });

  const handleTriggerImport = async (id: number) => {
    try {
      const res = await axios.post(`/co2/api/v1/sources/${id}/import_file/`);
      alert(res.data.message || 'Đã kích hoạt import thành công!');
      setRefetchKey(prev => prev + 1); // Refresh list to see status updates if any
    } catch (err) {
      console.error(err);
      alert('Không thể kích hoạt import!');
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Tên nguồn / Tệp',
        cell: info => <span style={{ fontWeight: 600 }}>{info.getValue() || info.row.original.original_filename}</span>,
      }),
      columnHelper.accessor('source_type', {
        header: 'Loại dữ liệu',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('upload_date', {
        header: 'Ngày tải lên',
        cell: info => info.getValue() ? new Date(info.getValue()).toLocaleString('vi-VN') : 'N/A',
      }),
      columnHelper.accessor('processed', {
        header: 'Đã xử lý',
        cell: info => {
          const isProcessed = info.getValue();
          return isProcessed ? (
            <span style={{ color: '#059669' }}><i className="fa fa-check-circle"></i> Rồi</span>
          ) : (
            <span style={{ color: '#d97706' }}><i className="fa fa-clock-o"></i> Chờ xử lý</span>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Trạng thái (Chi tiết)',
        cell: info => info.getValue() || 'N/A',
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Thao tác',
        cell: info => (
          <button 
            onClick={() => handleTriggerImport(info.row.original.id)}
            className="btn btn-sm btn-outline-primary"
            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #0284c7', borderRadius: '4px', background: '#fff', color: '#0284c7', cursor: 'pointer' }}
          >
            <i className="fa fa-play"></i> Kích hoạt
          </button>
        ),
      }),
    ],
    []
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="co2-page-title">
        <div>
          <h3>Quản lý tệp dữ liệu nguồn</h3>
          <p>Danh sách các file vệ tinh đã tải lên hệ thống</p>
        </div>
      </div>

      <div className="co2-card">
        <div className="co2-card-body" style={{ padding: 0 }}>
          <ReactTable
            data={data}
            columns={columns}
            pageCount={pageCount}
            pagination={pagination}
            setPagination={setPagination}
            isLoading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default SourceList;
