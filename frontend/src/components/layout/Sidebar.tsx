import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  Layers,
  LayoutDashboard,
  Network,
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
  tag?: string;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
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

  const navSections: NavSection[] = [
    {
      title: 'Graph Intelligence',
      items: [
        {
          label: 'Overview SOC',
          path: '/dashboard',
          icon: LayoutDashboard,
          match: ['/dashboard', '/'],
        },
        {
          label: 'Community Explorer',
          path: '/communities',
          icon: Layers,
          match: ['/communities'],
        },
        {
          label: 'Flagship Topology',
          path: '/communities/3',
          icon: Network,
          match: ['/communities/3'],
          tag: 'HOT',
        },
      ],
    },
    {
      title: 'Entity Forensics',
      items: [
        {
          label: 'Accounts Registry',
          path: '/accounts',
          icon: Users,
          match: ['/accounts'],
        },
        {
          label: 'Transaction Stream',
          path: '/transactions',
          icon: Activity,
          match: ['/transactions'],
        },
      ],
    },
    {
      title: 'Case Management',
      items: [
        {
          label: 'Investigations',
          path: '/investigations',
          icon: Briefcase,
          match: ['/investigations'],
          badge: openCasesCount > 0 ? openCasesCount.toString() : undefined,
        },
      ],
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
        width: '260px',
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
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            boxShadow: '0 0 16px rgba(0, 240, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
          }}
        >
          <ShieldAlert size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              TraceLine <span className="gradient-text-razorpay">AI</span>
            </span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Razorpay Risk Platform
          </span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, overflowY: 'auto' }}>
        {navSections.map((sec, sIdx) => (
          <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ padding: '0 10px 4px 10px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
              {sec.title}
            </div>
            {sec.items.map((item) => {
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
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 500,
                    color: active ? '#f8fafc' : 'var(--text-muted)',
                    backgroundColor: active ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                    border: active ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
                    boxShadow: active ? '0 0 12px rgba(0, 240, 255, 0.1)' : 'none',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'rgba(22, 36, 71, 0.5)';
                      e.currentTarget.style.color = '#f8fafc';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} style={{ color: active ? 'var(--accent-cyan)' : 'inherit' }} />
                    <span>{item.label}</span>
                  </div>

                  {item.tag && (
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(244, 63, 94, 0.2)',
                        border: '1px solid rgba(244, 63, 94, 0.4)',
                        color: '#fca5a5',
                        fontSize: '9px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {item.tag}
                    </span>
                  )}

                  {item.badge && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(0, 240, 255, 0.2)',
                        border: '1px solid rgba(0, 240, 255, 0.4)',
                        color: '#00F0FF',
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
          </div>
        ))}
      </nav>

      {/* Razorpay Engine Status Footer */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          backgroundColor: '#030712',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isOnline === true ? '#10b981' : isOnline === false ? '#ef4444' : '#f59e0b',
                boxShadow: isOnline === true ? '0 0 10px #10b981' : 'none',
              }}
              className={isOnline === true ? 'animate-pulse-dot' : ''}
            />
            <span style={{ color: 'var(--text-main)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {isOnline === true ? 'NEURAL API ONLINE' : isOnline === false ? 'API OFFLINE' : 'CONNECTING...'}
            </span>
          </div>

          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--accent-cyan)',
              backgroundColor: 'rgba(0, 240, 255, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            v2.4-PRO
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          <span>Louvain + LR/RF Engine</span>
          <span>&lt; 5ms inference</span>
        </div>
      </div>
    </aside>
  );
};
