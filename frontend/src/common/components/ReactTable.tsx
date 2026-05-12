import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  PaginationState,
} from '@tanstack/react-table';

interface ReactTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pageCount: number;
  pagination: PaginationState;
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>;
  isLoading?: boolean;
}

export function ReactTable<TData>({
  columns,
  data,
  pageCount,
  pagination,
  setPagination,
  isLoading = false,
}: ReactTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <div className="co2-card">
      <div className="co2-card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="co2-table" style={{ width: '100%' }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ whiteSpace: 'nowrap' }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px' }}>
                  <i className="fa fa-spinner fa-spin fa-2x" style={{ color: 'var(--color-accent-primary)' }}></i>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            style={{ padding: '6px 12px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: table.getCanPreviousPage() ? 'pointer' : 'not-allowed', opacity: table.getCanPreviousPage() ? 1 : 0.5 }}
          >
            <i className="fa fa-chevron-left"></i> Trước
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            style={{ padding: '6px 12px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: table.getCanNextPage() ? 'pointer' : 'not-allowed', opacity: table.getCanNextPage() ? 1 : 0.5 }}
          >
            Sau <i className="fa fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
