import React, { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';
import axios from 'axios';

interface MeasurementSource {
  id: number;
  file_name: string;
  file_format: string;
  measurement_date: string;
  quality_checked: boolean;
  file_size_mb?: number;
  processing_level?: string;
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
      columnHelper.accessor('file_name', {
        header: 'Tên tệp',
        cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
      }),
      columnHelper.accessor('file_format', {
        header: 'Định dạng',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('file_size_mb', {
        header: 'Dung lượng (MB)',
        cell: info => {
          const val = info.getValue();
          return val ? val.toLocaleString() : '0';
        },
      }),
      columnHelper.accessor('measurement_date', {
        header: 'Ngày đo',
        cell: info => info.getValue() ? new Date(info.getValue()).toLocaleDateString('vi-VN') : 'N/A',
      }),
      columnHelper.accessor('quality_checked', {
        header: 'Kiểm định',
        cell: info => {
          const isProcessed = info.getValue();
          return isProcessed ? (
            <span style={{ color: '#059669' }}><i className="fa fa-check-circle"></i> Đã xong</span>
          ) : (
            <span style={{ color: '#d97706' }}><i className="fa fa-clock-o"></i> Chờ xử lý</span>
          );
        },
      }),
      columnHelper.accessor('processing_level', {
        header: 'Cấp độ',
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
