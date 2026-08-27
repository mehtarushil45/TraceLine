export interface FilterOption<T = string> {
  label: string;
  value: T;
  count?: number;
}

interface FilterBarProps<T = string> {
  options: FilterOption<T>[];
  selected: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function FilterBar<T = string>({
  options,
  selected,
  onChange,
  size = 'md',
}: FilterBarProps<T>) {
  const isSmall = size === 'sm';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        backgroundColor: 'var(--bg-input)',
        padding: '2px',
        borderRadius: '5px',
        border: '1px solid var(--border)',
      }}
    >
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: isSmall ? '3px 8px' : '4px 10px',
              borderRadius: '4px',
              border: 'none',
              fontSize: isSmall ? '10px' : '11px',
              fontWeight: isSelected ? 700 : 500,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'var(--bg-subtle)' : 'transparent',
              color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.12s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                style={{
                  fontSize: '10px',
                  color: isSelected ? 'var(--accent)' : 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ({opt.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
