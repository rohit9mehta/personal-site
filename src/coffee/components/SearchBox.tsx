import type { Ref } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

export function SearchBox({ value, onChange, ref }: Props) {
  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        ref={ref}
        className="search__input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search cafés, cities, neighborhoods"
        aria-label="Search coffee shops"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value ? (
        <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 5l6 6M11 5l-6 6" />
          </svg>
        </button>
      ) : (
        <kbd className="search__key" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}
