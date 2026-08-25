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
          height: '60px',
          backgroundColor: 'var(--bg-header)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
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
            width: '420px',
            padding: '8px 14px',
            backgroundColor: '#070d1e',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-cyan)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 240, 255, 0.15)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Search size={15} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Search Communities, Accounts, or Txs...
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <kbd
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#162447',
                border: '1px solid var(--border-light)',
                color: 'var(--text-dim)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Command size={10} /> K
            </kbd>
          </div>
        </div>

        {/* Global Telemetry & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Live Engine Telemetry Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-cyan)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#00F0FF',
                boxShadow: '0 0 8px #00F0FF',
              }}
              className="animate-pulse-dot"
            />
            <span className="font-semibold">GRAPH ENGINE: 50K NODES // 2.6M EDGES</span>
          </div>

          {/* SAR Forensic Export Trigger */}
          <button
            onClick={() => setIsSarOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#162447',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#1e293b';
              e.currentTarget.style.borderColor = 'var(--accent-cyan)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#162447';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
          >
            <FileText size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>Generate SAR</span>
          </button>

          {/* Strict Leakage-Free Mode Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '11px',
              color: '#86efac',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            <Shield size={13} />
            <span>OBSERVABLE ZERO-LEAKAGE</span>
          </div>
        </div>
      </header>

      <OmnisearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <SarExportModal isOpen={isSarOpen} onClose={() => setIsSarOpen(false)} />
    </>
  );
};
