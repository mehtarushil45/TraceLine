import React, { useState } from 'react';
import { Command, Search, Shield } from 'lucide-react';
import { CommandPalette } from './CommandPalette';

export const Header: React.FC = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
        </div>
      </header>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};
