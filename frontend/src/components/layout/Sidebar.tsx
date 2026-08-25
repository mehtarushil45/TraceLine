import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  Layers,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { getHealth } from '../../api';
import { getCases, useCaseWatcher } from '../../utils/caseManager';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [openCasesCount, setOpenCasesCount] = useState(0);

  const updateCasesCount = () => {
    const cases = getCases();
    setOpenCasesCount(cases.filter((c) => c.status !== 'CLOSED').length);
  };

  useEffect(() => {
    updateCasesCount();
    const unsub = useCaseWatcher(updateCasesCount);
    return unsub;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await getHealth();
        if (isMounted) {
          setIsOnline(res.status === 'ok');
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    {
      label: 'Overview',
      path: '/dashboard',
      icon: LayoutDashboard,
      match: ['/dashboard', '/'],
    },
    {
      label: 'Communities',
      path: '/communities',
      icon: Layers,
      match: ['/communities'],
    },
    {
      label: 'Accounts',
      path: '/accounts',
      icon: Users,
      match: ['/accounts'],
    },
    {
      label: 'Transactions',
      path: '/transactions',
      icon: Activity,
      match: ['/transactions'],
    },
    {
      label: 'Investigations',
      path: '/investigations',
      icon: Briefcase,
      match: ['/investigations'],
      badge: openCasesCount > 0 ? openCasesCount.toString() : undefined,
    },
  ];

  const isActive = (matches: string[]) => {
    return matches.some((m) => {
      if (m === '/' && location.pathname === '/') return true;
      if (m !== '/' && location.pathname.startsWith(m)) return true;
      return false;
    });
  };

  return (
    <aside
      style={{
        width: '240px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '20px 20px 16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
          }}
        >
          <ShieldAlert size={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-main)' }}>
            TraceLine
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.02em' }}>
            Fraud Intelligence
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <div style={{ padding: '0 8px 8px 8px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
          Navigation
        </div>
        {navItems.map((item) => {
          const active = isActive(item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--text-main)' : 'var(--text-muted)',
                backgroundColor: active ? 'var(--bg-subtle)' : 'transparent',
                border: active ? '1px solid var(--border-light)' : '1px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.4)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }
              }}
              onMouseOut={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon size={16} style={{ color: active ? 'var(--accent-cyan)' : 'inherit' }} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isOnline === true ? '#10b981' : isOnline === false ? '#ef4444' : '#f59e0b',
              boxShadow: isOnline === true ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
            }}
            className={isOnline === true ? 'animate-pulse-dot' : ''}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500 }}>
            {isOnline === true ? 'API Online' : isOnline === false ? 'API Offline' : 'Connecting...'}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-dim)',
          }}
        >
          v1.0.0
        </span>
      </div>
    </aside>
  );
};
