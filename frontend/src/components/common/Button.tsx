import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled,
  style = {},
  ...rest
}) => {
  const sizeStyles = {
    sm: { padding: '5px 10px', fontSize: '11px', gap: '5px' },
    md: { padding: '7px 14px', fontSize: '12px', gap: '6px' },
    lg: { padding: '10px 20px', fontSize: '13px', gap: '8px' },
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--accent)',
      border: '1px solid var(--accent)',
      color: '#ffffff',
    },
    secondary: {
      backgroundColor: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      color: 'var(--text-primary)',
    },
    danger: {
      backgroundColor: 'var(--risk-high-bg)',
      border: '1px solid var(--risk-high-border)',
      color: 'var(--risk-high)',
    },
    ghost: {
      backgroundColor: 'transparent',
      border: '1px solid transparent',
      color: 'var(--text-secondary)',
    },
  };

  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[variant];

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '5px',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s ease',
        ...currentSize,
        ...currentVariant,
        ...style,
      }}
      onMouseOver={(e) => {
        if (!disabled && !loading) {
          if (variant === 'primary') {
            e.currentTarget.style.backgroundColor = '#2563eb';
          } else if (variant === 'secondary') {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--border-light)';
          } else if (variant === 'ghost') {
            e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }
      }}
      onMouseOut={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.backgroundColor = currentVariant.backgroundColor;
          e.currentTarget.style.borderColor = currentVariant.border.split(' ')[2] || 'transparent';
          e.currentTarget.style.color = currentVariant.color;
        }
      }}
      {...rest}
    >
      {Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
      {Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 12 : 14} />}
    </button>
  );
};
