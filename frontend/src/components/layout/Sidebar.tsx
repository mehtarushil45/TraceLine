import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  FlaskConical,
  Layers,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { getHealth } from '../../api';
import { getCases, subscribeToCaseUpdates } from '../../utils/caseManager';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  match: string[];
  badge?: string;
}

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
    const unsub = subscribeToCaseUpdates(updateCasesCount);
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

  const navItems: NavItem[] = [
    {
      label: 'Risk Queue',
      path: '/',
      icon: ShieldAlert,
      match: ['/'],
    },
    {
      label: 'Communities',
      path: '/communities',
      icon: Layers,
      match: ['/communities'],
    },
    {
      label: 'Forensic Workspace',
      path: '/forensics',
      icon: FlaskConical,
      match: ['/forensics'],
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
      label: 'Cases',
      path: '/investigations',
      icon: Briefcase,
      match: ['/investigations'],
      badge: openCasesCount > 0 ? openCasesCount.toString() : undefined,
    },
  ];

  const isItemActive = (item: NavItem) => {
    if (item.path === '/') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(item.path);
  };

  return (
    <aside
      style={{
        width: '230px',
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
          padding: '18px 16px 14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '5px',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}
        >
          <Shield size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            TraceLine
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Risk Investigation
          </span>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '4px 8px 8px 8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
          Workspace
        </div>

        {navItems.map((item) => {
          const active = isItemActive(item);
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                borderRadius: '5px',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: active ? 'var(--bg-subtle)' : 'transparent',
                border: active ? '1px solid var(--border-light)' : '1px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.12s ease',
              }}
              onMouseOver={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseOut={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <Icon size={15} style={{ color: active ? 'var(--accent)' : 'inherit' }} />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: active ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
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
          padding: '12px 14px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-sidebar)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-dim)' }}>Engine API</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isOnline ? '#10b981' : isOnline === false ? '#ef4444' : '#f59e0b',
              }}
            />
            <span style={{ color: isOnline ? '#10b981' : 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {isOnline ? 'CONNECTED' : isOnline === false ? 'OFFLINE' : 'CONNECTING'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
