// A dropdown you can type into.
//
// A native <select> is fine for five options and useless for a hundred and eighty — the
// employee directory made that obvious. This keeps the same controlled-value contract as a
// <select> so it can replace one in place, and adds filtering plus keyboard navigation.
import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchOption {
  value: string;
  label: string;
  /** secondary text, searched as well as shown — e.g. a designation or department */
  hint?: string;
}

/**
 * Every word must match somewhere in the label or the hint, so "sabir project" finds
 * "Mohammed Sabir A · Project Manager" and "design mumbai" narrows to designers in Mumbai.
 * Substring rather than prefix, because people search by surname as often as by first name.
 */
export function filterOptions(options: SearchOption[], query: string): SearchOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const words = q.split(/\s+/);
  return options.filter((o) => {
    const hay = `${o.label} ${o.hint ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'N/A',
  disabled = false,
  minWidth = 220,
}: {
  value: string | null;
  options: SearchOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** what to show, and to offer as the clearing choice, when nothing is selected */
  emptyLabel?: string;
  disabled?: boolean;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const matches = useMemo(() => filterOptions(options, query), [options, query]);

  useEffect(() => {
    if (open) input.current?.focus();
    else setQuery('');
    setActive(0);
  }, [open]);

  // close when focus or a click leaves the control entirely
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const choose = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < 0) choose(null);
      else if (matches[active]) choose(matches[active].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} style={{ position: 'relative', minWidth, flex: 1 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'var(--panel)',
          fontWeight: 400,
          color: selected ? 'var(--text)' : 'var(--faint)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={selected ? `${selected.label}${selected.hint ? ` · ${selected.hint}` : ''}` : emptyLabel}
      >
        {selected ? `${selected.label}${selected.hint ? ` · ${selected.hint}` : ''}` : emptyLabel}
        <span className="faint" style={{ float: 'right' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 3px)',
            left: 0,
            right: 0,
            minWidth,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(16,24,40,.14)',
            overflow: 'hidden',
          }}
        >
          <input
            ref={input}
            value={query}
            placeholder={placeholder}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', borderRadius: 0, boxShadow: 'none' }}
          />
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <Row label={emptyLabel} muted onPick={() => choose(null)} highlighted={active === -1} />
            {matches.map((o, i) => (
              <Row
                key={o.value}
                label={o.label}
                hint={o.hint}
                highlighted={i === active}
                selected={o.value === value}
                onPick={() => choose(o.value)}
                onHover={() => setActive(i)}
              />
            ))}
            {matches.length === 0 && (
              <div className="muted" style={{ padding: '10px 12px', fontSize: 12 }}>
                Nothing matches “{query}”.
              </div>
            )}
          </div>
          {options.length > 12 && (
            <div className="faint" style={{ padding: '5px 12px', fontSize: 11, borderTop: '1px solid var(--line2)' }}>
              {matches.length} of {options.length} · type to filter, ↑↓ to move, Enter to pick
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label, hint, muted, selected, highlighted, onPick, onHover,
}: {
  label: string;
  hint?: string;
  muted?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  onPick: () => void;
  onHover?: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={!!selected}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      onMouseEnter={onHover}
      style={{
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: 12.5,
        background: highlighted ? 'var(--accent-soft)' : selected ? 'var(--panel2)' : 'transparent',
        color: muted ? 'var(--faint)' : 'var(--text)',
      }}
    >
      {label}
      {hint && <div className="faint" style={{ fontSize: 11 }}>{hint}</div>}
    </div>
  );
}
