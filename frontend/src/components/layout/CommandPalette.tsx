import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Briefcase,
  CornerDownLeft,
  Layers,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { getCommunities } from '../../api';
import type { CommunitySummary } from '../../types/api';
import type { InvestigationCase } from '../../types/cases';
import { getCases, subscribeToCaseUpdates } from '../../utils/caseManager';
import './command-palette.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  type: 'COMMUNITY' | 'CASE' | 'ACCOUNT' | 'TRANSACTION' | 'NAVIGATION';
  title: string;
  subtitle: string;
  path: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'accent' | 'high' | 'med' | 'low';
}

interface PaletteGroup {
  name: string;
  icon: React.ElementType;
  items: PaletteItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [cases, setCases] = useState<InvestigationCase[]>([]);

  // Load cases
  useEffect(() => {
    setCases(getCases());
    const unsub = subscribeToCaseUpdates(() => setCases(getCases()));
    return unsub;
  }, []);

  // Preload communities from cache for instant search
  useEffect(() => {
    if (isOpen) {
      getCommunities()
        .then((res) => setCommunities(res.items))
        .catch(() => {});
    }
  }, [isOpen]);

  // Debounce search query input (150ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Auto-focus search input and reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global keydown listeners for Escape and Ctrl+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Build grouped results based on search query
  const groups: PaletteGroup[] = useMemo(() => {
    const raw = debouncedQuery;

    // 1. When query is EMPTY: Show Quick Access & Recents
    if (!raw) {
      const topComms: PaletteItem[] = communities.slice(0, 4).map((c) => ({
        id: `comm-${c.community_id}`,
        type: 'COMMUNITY',
        title: `Community #${c.community_id}`,
        subtitle: `${c.member_count} member accounts · ML Risk ${c.risk_score.toFixed(0)}/100`,
        path: `/communities/${c.community_id}?tab=overview`,
        badge: c.risk_level,
        badgeVariant: c.risk_level === 'HIGH' ? 'high' : c.risk_level === 'MEDIUM' ? 'med' : 'low',
      }));

      const activeCases: PaletteItem[] = cases.slice(0, 3).map((c) => ({
        id: `case-${c.id}`,
        type: 'CASE',
        title: c.title,
        subtitle: `${c.targets.length} target${c.targets.length === 1 ? '' : 's'} · Status: ${c.status}`,
        path: `/investigations/${c.id}`,
        badge: c.priority,
        badgeVariant: c.priority === 'HIGH' ? 'high' : c.priority === 'MEDIUM' ? 'med' : 'neutral',
      }));

      const quickNav: PaletteItem[] = [
        {
          id: 'nav-risk-queue',
          type: 'NAVIGATION',
          title: 'Risk Queue (Triage Desk)',
          subtitle: 'Prioritized graph clusters awaiting investigator review — full community directory',
          path: '/',
        },
        {
          id: 'nav-communities',
          type: 'NAVIGATION',
          title: 'Community Intelligence',
          subtitle: 'Browse all detected community partitions and select an investigation target',
          path: '/communities',
        },
        {
          id: 'nav-cases',
          type: 'NAVIGATION',
          title: 'Investigation Cases',
          subtitle: 'Forensic dossiers, active investigations, and SAR exports',
          path: '/investigations',
        },
        {
          id: 'nav-accounts',
          type: 'NAVIGATION',
          title: 'Accounts Registry',
          subtitle: 'Lookup accounts, connections, and hardware footprints',
          path: '/accounts',
        },
        {
          id: 'nav-transactions',
          type: 'NAVIGATION',
          title: 'Transaction Registry',
          subtitle: 'Search individual money transfers and merchant flows',
          path: '/transactions',
        },
      ];

      const result: PaletteGroup[] = [];
      if (topComms.length > 0) {
        result.push({ name: 'Priority Communities', icon: Layers, items: topComms });
      }
      if (activeCases.length > 0) {
        result.push({ name: 'Investigation Dossiers', icon: Briefcase, items: activeCases });
      }
      result.push({ name: 'Quick Navigation', icon: ArrowRight, items: quickNav });
      return result;
    }

    // 2. When query HAS TEXT: Search across real entities
    const matchedComms: PaletteItem[] = communities
      .filter((c) => {
        const matchTerms = [
          `community #${c.community_id}`,
          `community ${c.community_id}`,
          `#${c.community_id}`,
          String(c.community_id),
          c.risk_level,
          c.top_signal_1,
          c.top_signal_2,
          c.top_signal_3,
        ];
        return matchTerms.some((term) => term?.toLowerCase().includes(raw));
      })
      .slice(0, 5)
      .map((c) => ({
        id: `comm-${c.community_id}`,
        type: 'COMMUNITY',
        title: `Community #${c.community_id}`,
        subtitle: `${c.member_count} member accounts · ML Risk ${c.risk_score.toFixed(0)}/100 · ${c.top_signal_1 || 'Graph anomaly'}`,
        path: `/communities/${c.community_id}?tab=overview`,
        badge: c.risk_level,
        badgeVariant: c.risk_level === 'HIGH' ? 'high' : c.risk_level === 'MEDIUM' ? 'med' : 'low',
      }));

    const matchedCases: PaletteItem[] = cases
      .filter((c) => {
        return (
          c.title.toLowerCase().includes(raw) ||
          c.id.toLowerCase().includes(raw) ||
          c.targets.some((t) => t.id.toLowerCase().includes(raw) || t.label.toLowerCase().includes(raw))
        );
      })
      .slice(0, 4)
      .map((c) => ({
        id: `case-${c.id}`,
        type: 'CASE',
        title: c.title,
        subtitle: `${c.targets.length} target${c.targets.length === 1 ? '' : 's'} · Status: ${c.status}`,
        path: `/investigations/${c.id}`,
        badge: c.priority,
        badgeVariant: c.priority === 'HIGH' ? 'high' : c.priority === 'MEDIUM' ? 'med' : 'neutral',
      }));

    const matchedAccounts: PaletteItem[] = [];
    if (raw.startsWith('acc') || raw.includes('acc_') || /^\d+$/.test(raw)) {
      const cleanAcc = raw.startsWith('acc_') ? raw : `acc_${raw.replace(/^acc_?/, '')}`;
      matchedAccounts.push({
        id: `acc-${cleanAcc}`,
        type: 'ACCOUNT',
        title: cleanAcc,
        subtitle: 'Direct account profile & entity connections lookup',
        path: `/accounts/${cleanAcc}`,
      });
    }

    const matchedTransactions: PaletteItem[] = [];
    if (raw.startsWith('tx') || raw.includes('tx_')) {
      const cleanTx = raw.startsWith('tx_') ? raw : `tx_${raw.replace(/^tx_?/, '')}`;
      matchedTransactions.push({
        id: `tx-${cleanTx}`,
        type: 'TRANSACTION',
        title: cleanTx,
        subtitle: 'Direct transaction flow & authorization lookup',
        path: `/transactions/${cleanTx}`,
      });
    }

    const result: PaletteGroup[] = [];
    if (matchedComms.length > 0) {
      result.push({ name: 'Communities', icon: Layers, items: matchedComms });
    }
    if (matchedCases.length > 0) {
      result.push({ name: 'Investigation Cases', icon: Briefcase, items: matchedCases });
    }
    if (matchedAccounts.length > 0) {
      result.push({ name: 'Accounts', icon: Users, items: matchedAccounts });
    }
    if (matchedTransactions.length > 0) {
      result.push({ name: 'Transactions', icon: Activity, items: matchedTransactions });
    }
    return result;
  }, [debouncedQuery, communities, cases]);

  // Flatten items for linear keyboard navigation index
  const flatItems = useMemo(() => {
    return groups.flatMap((g) => g.items);
  }, [groups]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatItems]);

  const handleSelect = (item: PaletteItem) => {
    navigate(item.path);
    onClose();
    setQuery('');
  };

  // Keyboard navigation handler for ArrowUp, ArrowDown, Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentItem = flatItems[selectedIndex] || flatItems[0];
      if (currentItem) {
        handleSelect(currentItem);
      }
    }
  };

  if (!isOpen) return null;

  let currentGlobalIndex = -1;

  return (
    <div className="cmd-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search Header Bar */}
        <div className="cmd-header">
          <Search size={16} className="cmd-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search investigations, communities, accounts (acc_...), or transactions (tx_...)..."
            aria-label="Command search input"
          />
          {query && (
            <button
              type="button"
              className="cmd-clear-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              title="Clear search query"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="cmd-esc-badge" onClick={onClose} title="Close search (Escape)">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="cmd-body" role="listbox">
          {groups.length > 0 ? (
            groups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.name} className="cmd-group">
                  <div className="cmd-group-title">
                    <GroupIcon size={12} />
                    <span>{group.name}</span>
                  </div>
                  <div className="cmd-group-items">
                    {group.items.map((item) => {
                      currentGlobalIndex++;
                      const isSelected = currentGlobalIndex === selectedIndex;
                      const itemIndex = currentGlobalIndex;

                      return (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={isSelected}
                          className={`cmd-item ${isSelected ? 'cmd-item--selected' : ''}`}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                        >
                          <div className="cmd-item-left">
                            <span className="cmd-item-type-badge">{item.type}</span>
                            <div className="cmd-item-text">
                              <strong className="cmd-item-title">{item.title}</strong>
                              <span className="cmd-item-subtitle">{item.subtitle}</span>
                            </div>
                          </div>

                          <div className="cmd-item-right">
                            {item.badge && (
                              <span className={`cmd-badge cmd-badge--${item.badgeVariant || 'neutral'}`}>
                                {item.badge}
                              </span>
                            )}
                            {isSelected && (
                              <kbd className="cmd-enter-hint">
                                <CornerDownLeft size={10} /> Enter
                              </kbd>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="cmd-empty">
              <ShieldAlert size={24} className="cmd-empty-icon" />
              <strong>No matching records found</strong>
              <span>Search by community ID, account ID (e.g. <code>acc_37963</code>), transaction ID (e.g. <code>tx_49102</code>), or case title.</span>
            </div>
          )}
        </div>

        {/* Keyboard Helper Footer */}
        <div className="cmd-footer">
          <div className="cmd-shortcuts">
            <span className="cmd-shortcut">
              <kbd>↑</kbd> <kbd>↓</kbd> Navigate
            </span>
            <span className="cmd-shortcut">
              <kbd>↵</kbd> Select
            </span>
            <span className="cmd-shortcut">
              <kbd>esc</kbd> Close
            </span>
          </div>
          <span className="cmd-brand">TraceLine Command</span>
        </div>
      </div>
    </div>
  );
};
