import React, { useState } from 'react';
import {
  Command,
  FileText,
  Search,
  Shield,
} from 'lucide-react';
import { OmnisearchModal } from './OmnisearchModal';
import { SarExportModal } from './SarExportModal';

export const Header: React.FC = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSarOpen, setIsSarOpen] = useState(false);

  return (
    <>
      <header
        style={{
          height: '52px',
          backgroundColor: 'var(--bg-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        {/* Omnisearch Trigger Bar */}
        <div
          onClick={() => setIsSearchOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '440px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-light)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={14} style={{ color: 'var(--text-dim)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Search investigations, communities, accounts and transactions...
            </span>
          </div>

          <kbd
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Command size={9} /> K
          </kbd>
        </div>

        {/* Global Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Strict Leakage-Free Mode Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: 'var(--risk-low-bg)',
              border: '1px solid var(--risk-low-border)',
              fontSize: '11px',
              color: '#86efac',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            <Shield size={12} />
            <span>OBSERVABLE ZERO-LEAKAGE</span>
          </div>

          {/* SAR Forensic Export Trigger */}
          <button
            onClick={() => setIsSarOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <FileText size={13} style={{ color: 'var(--accent)' }} />
            <span>SAR Export</span>
          </button>
        </div>
      </header>

      <OmnisearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <SarExportModal isOpen={isSarOpen} onClose={() => setIsSarOpen(false)} />
    </>
  );
};
