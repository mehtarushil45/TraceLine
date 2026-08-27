import React from 'react';

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  margin?: string | number;
  style?: React.CSSProperties;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  margin = '12px 0',
  style = {},
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        style={{
          width: '1px',
          alignSelf: 'stretch',
          backgroundColor: 'var(--border)',
          margin: typeof margin === 'number' ? `0 ${margin}px` : margin,
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={{
        height: '1px',
        width: '100%',
        backgroundColor: 'var(--border)',
        margin: typeof margin === 'number' ? `${margin}px 0` : margin,
        ...style,
      }}
    />
  );
};
