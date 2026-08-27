import React from 'react';
import { Link } from 'react-router-dom';

interface EntityLinkProps {
  type: 'community' | 'account' | 'transaction' | 'case';
  id: string | number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const EntityLink: React.FC<EntityLinkProps> = ({
  type,
  id,
  label,
  className = '',
  style = {},
}) => {
  const getPath = () => {
    switch (type) {
      case 'community':
        return `/communities/${id}`;
      case 'account':
        return `/accounts/${id}`;
      case 'transaction':
        return `/transactions/${id}`;
      case 'case':
        return `/investigations/${id}`;
      default:
        return '/';
    }
  };

  const displayLabel =
    label || (type === 'community' ? `Community #${id}` : String(id));

  return (
    <Link
      to={getPath()}
      className={`font-mono ${className}`}
      style={{
        color: 'var(--text-primary)',
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: '12px',
        transition: 'color 0.12s ease',
        ...style,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.color = 'var(--accent)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
    >
      {displayLabel}
    </Link>
  );
};
