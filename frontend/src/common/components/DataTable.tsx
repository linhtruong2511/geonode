import React from 'react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (item: T) => void;
  actions?: (item: T) => React.ReactNode;
}

export function DataTable<T extends { id: number | string }>({
  columns,
  data,
  loading,
  onRowClick,
  actions
}: DataTableProps<T>) {
  if (loading) {
    return <div className="text-center p-4">Đang tải dữ liệu...</div>;
  }

  if (data.length === 0) {
    return <div className="text-center p-4 text-muted">Không có dữ liệu hiển thị.</div>;
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover co2-table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx}>{col.header}</th>
            ))}
            {actions && <th>Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} onClick={() => onRowClick?.(item)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
              {columns.map((col, idx) => (
                <td key={idx}>
                  {typeof col.accessor === 'function'
                    ? col.accessor(item)
                    : (item[col.accessor] as React.ReactNode)}
                </td>
              ))}
              {actions && (
                <td onClick={(e) => e.stopPropagation()}>
                  {actions(item)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
