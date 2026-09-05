import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TopProgressBar } from '../common';

export const Layout: React.FC = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const scrollPositions = useRef<Map<string, number>>(new Map());

  // Save scroll position before route change
  useEffect(() => {
    const handleScroll = () => {
      scrollPositions.current.set(location.key, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.key]);

  // Restore scroll position on back/forward navigation or start at top on new navigation
  useEffect(() => {
    if (navType === 'POP') {
      const saved = scrollPositions.current.get(location.key);
      if (saved !== undefined) {
        window.scrollTo({ top: saved, behavior: 'instant' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.key, navType]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-app)' }}>
      <TopProgressBar />
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <Header />
        <main style={{ flex: 1, padding: '24px', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
