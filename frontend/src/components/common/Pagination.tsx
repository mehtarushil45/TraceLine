import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}
    >
      <div>
        Showing <span className="font-mono font-semibold text-slate-200">{startItem.toLocaleString()}</span>–
        <span className="font-mono font-semibold text-slate-200">{endItem.toLocaleString()}</span> of{' '}
        <span className="font-mono font-semibold text-slate-200">{totalItems.toLocaleString()}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '4px',
            backgroundColor: currentPage <= 1 ? '#0b1120' : '#1e293b',
            border: '1px solid var(--border)',
            color: currentPage <= 1 ? 'var(--text-dim)' : 'var(--text-main)',
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          }}
        >
          <ChevronLeft size={14} />
          Previous
        </button>

        <span style={{ padding: '0 8px', fontFamily: 'var(--font-mono)' }}>
          Page <span className="font-semibold text-slate-200">{currentPage}</span> / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '4px',
            backgroundColor: currentPage >= totalPages ? '#0b1120' : '#1e293b',
            border: '1px solid var(--border)',
            color: currentPage >= totalPages ? 'var(--text-dim)' : 'var(--text-main)',
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          }}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
