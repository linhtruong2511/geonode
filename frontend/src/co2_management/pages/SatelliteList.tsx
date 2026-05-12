import React, { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { useFetchData } from '@common/hooks/useFetchData';
import { ReactTable } from '@common/components/ReactTable';

interface Satellite {
  id: number;
  satellite_name: string;
  operator: string;
  launch_date: string;
  is_active: string;
  description: string;
}

const columnHelper = createColumnHelper<Satellite>();

const SatelliteList: React.FC = () => {
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

  const { data, totalCount, loading } = useFetchData<Satellite>('/co2/api/v1/satellites/', {
    page: pageIndex + 1,
    pageSize: pageSize,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('satellite_name', {
        header: 'Tên vệ tinh',
        cell: info => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
      }),
      columnHelper.accessor('operator', {
        header: 'Tổ chức',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('launch_date', {
        header: 'Ngày phóng',
        cell: info => info.getValue() ? new Date(info.getValue()).toLocaleDateString('vi-VN') : 'N/A',
      }),
      columnHelper.accessor('is_active', {
        header: 'Trạng thái',
        cell: info => {
          const status = info.getValue();
          let color = '#64748b';
          let bg = '#f1f5f9';
          if (status  == 'true') {
            color = '#059669';
            bg = '#d1fae5';
          } else {
            color = '#dc2626';
            bg = '#fee2e2';
          }
          return (
            <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: bg, color: color, fontSize: '12px', fontWeight: 600 }}>
              {status}
            </span>
          );
        },
      }),
    ],
    []
  );

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div>
      <div className="co2-card">
        <div className="co2-card-header">
          <i className="fa fa-list"></i> Danh sách vệ tinh
        </div>
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

export default SatelliteList;
