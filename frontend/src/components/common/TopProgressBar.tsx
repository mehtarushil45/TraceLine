import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface TopProgressBarProps {
  active?: boolean;
}

export const TopProgressBar: React.FC<TopProgressBarProps> = ({ active = false }) => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  // Trigger swift feedback on route location changes
  useEffect(() => {
    setVisible(true);
    setProgress(30);

    const t1 = setTimeout(() => setProgress(75), 100);
    const t2 = setTimeout(() => setProgress(100), 220);
    const t3 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname, location.search]);

  // Also respect explicit active prop (for async boundary loading)
  useEffect(() => {
    if (active) {
      setVisible(true);
      setProgress(60);
    } else if (progress > 0) {
      setProgress(100);
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [active, progress]);

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 99999,
        pointerEvents: 'none',
        backgroundColor: 'transparent',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #059669, #10b981, #34d399, #86efac)',
          boxShadow: '0 0 8px rgba(16, 185, 129, 0.8), 0 0 16px rgba(52, 211, 153, 0.5)',
          transition: progress === 100 ? 'width 0.15s ease-out, opacity 0.2s ease-out' : 'width 0.25s ease-in-out',
          opacity: progress === 100 ? 0.2 : 1,
        }}
      />
    </div>
  );
};
