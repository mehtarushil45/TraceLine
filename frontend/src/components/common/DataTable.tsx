import React from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found.',
  loading = false,
  className = '',
  style = {},
}: DataTableProps<T>) {
  if (!loading && data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div style={{ overflowX: 'auto', width: '100%', ...style }}>
      <table className={`sec-table ${className}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={keyExtractor(item, idx)}
              onClick={() => onRowClick?.(item)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              {columns.map((col) => {
                const value = (item as Record<string, unknown>)[col.key];
                return (
                  <td
                    key={col.key}
                    style={{
                      textAlign: col.align || 'left',
                    }}
                  >
                    {col.render ? col.render(item, idx) : (value as React.ReactNode)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
