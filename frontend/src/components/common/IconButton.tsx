import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'danger';
  title?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  size = 'md',
  variant = 'default',
  title,
  disabled,
  style = {},
  ...rest
}) => {
  const sizeMap = {
    sm: { width: '26px', height: '26px', iconSize: 13 },
    md: { width: '32px', height: '32px', iconSize: 15 },
    lg: { width: '38px', height: '38px', iconSize: 18 },
  };

  const currentSize = sizeMap[size];

  let bg = 'var(--bg-subtle)';
  let border = '1px solid var(--border)';
  let color = 'var(--text-secondary)';

  if (variant === 'ghost') {
    bg = 'transparent';
    border = '1px solid transparent';
  } else if (variant === 'danger') {
    bg = 'var(--risk-high-bg)';
    border = '1px solid var(--risk-high-border)';
    color = 'var(--risk-high)';
  }

  return (
    <button
      title={title}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: currentSize.width,
        height: currentSize.height,
        borderRadius: '5px',
        backgroundColor: bg,
        border,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s ease',
        flexShrink: 0,
        ...style,
      }}
      onMouseOver={(e) => {
        if (!disabled) {
          if (variant === 'default') {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--border-light)';
            e.currentTarget.style.color = 'var(--text-primary)';
          } else if (variant === 'ghost') {
            e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }
      }}
      onMouseOut={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = bg;
          e.currentTarget.style.borderColor = border.split(' ')[2] || 'transparent';
          e.currentTarget.style.color = color;
        }
      }}
      {...rest}
    >
      <Icon size={currentSize.iconSize} />
    </button>
  );
};
