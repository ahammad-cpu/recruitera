import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, X, ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Profile } from '@/hooks/useUsersData';
import type { PipelineFilterState } from './PipelineFilters';
import { filtersActiveCount, resetFilters } from './PipelineFilters';

type Props = {
  value: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  profiles: Profile[];
};

/**
 * Inline filter bar (matches v2 pipeline layout). Everything the user needs
 * to slice the board is visible above the columns — no side drawer to open.
 * Creation Date From/To + Close Date From/To are the dominant controls
 * (per the "more comfortable, more focus" ask); owner + temperature sit in
 * compact dropdowns; Apply/Reset on the far right.
 */
export function PipelineFilterBar({ value, onChange, profiles }: Props) {
  // Local draft so keystrokes in the date pickers don't rebuild the board on
  // every character. User clicks Apply Filters (or Reset) to commit.
  const [draft, setDraft] = useState<PipelineFilterState>(value);

  // Reset local draft when parent value changes externally (e.g. URL sync).
  const activeCount = filtersActiveCount(value);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);

  function apply() { onChange(draft); }
  function reset() {
    // Reset returns to start-of-year rather than a bare empty filter — the
    // pipeline is almost never useful without a date anchor.
    const r = resetFilters();
    setDraft(r);
    onChange(r);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Filter size={13} className="text-text-3" />
        <div className="text-[10px] font-black tracking-[0.14em] uppercase text-text-3">Filters</div>
        {activeCount > 0 && (
          <span className="tnum inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-strong text-cg-900 text-[10px] font-black">
            {activeCount}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px] max-w-[340px]">
          <DateRange
            label="Created"
            from={draft.closeFrom}
            to={draft.closeTo}
            onFrom={(v) => setDraft((d) => ({ ...d, closeFrom: v }))}
            onTo={(v) => setDraft((d) => ({ ...d, closeTo: v }))}
          />
        </div>

        <div className="flex-1 min-w-[200px] max-w-[280px]">
          <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-1.5">Sales Owner</div>
          <OwnerMulti
            profiles={profiles}
            selected={draft.owners}
            onChange={(next) => setDraft((d) => ({ ...d, owners: next }))}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={reset}
            disabled={activeCount === 0 && !dirty}
            className="text-[13px] font-bold text-text-3 hover:text-bad disabled:opacity-40"
          >
            Reset Filters
          </button>
          <button
            onClick={apply}
            disabled={!dirty}
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-[13px] font-black transition-colors',
              dirty
                ? 'bg-accent text-cg-900 border border-accent-strong hover:bg-accent-strong'
                : 'bg-surface-2 text-text-3 border border-border cursor-not-allowed',
            )}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

function DateRange({
  label, from, to, onFrom, onTo,
}: {
  label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-text-3 font-bold">From</label>
          <div className="relative">
            <input
              type="date"
              value={from}
              onChange={(e) => onFrom(e.target.value)}
              className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              placeholder="dd/mm/yyyy"
            />
            {from && (
              <button onClick={() => onFrom('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-bad">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-text-3 font-bold">To</label>
          <div className="relative">
            <input
              type="date"
              value={to}
              onChange={(e) => onTo(e.target.value)}
              className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              placeholder="dd/mm/yyyy"
            />
            {to && (
              <button onClick={() => onTo('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-bad">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerMulti({
  profiles, selected, onChange,
}: {
  profiles: Profile[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    const safe = (profiles ?? []).filter((p): p is Profile => !!p && !!p.id);
    if (!n) return safe;
    return safe.filter((p) => (p.full_name || '').toLowerCase().includes(n) || (p.email || '').toLowerCase().includes(n));
  }, [profiles, q]);

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  function clear() { onChange([]); }
  function selectAll() { onChange(matches.map((p) => p.id)); }

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p) => { if (p?.id) m.set(p.id, p.full_name || p.email || '—'); });
    return m;
  }, [profiles]);

  const summary =
    selected.length === 0 ? 'All owners'
    : selected.length === 1 ? (labelById.get(selected[0]) || '1 owner')
    : `${selected.length} owners`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full h-10 pl-3 pr-8 bg-surface border rounded-lg text-[13px] font-semibold text-left flex items-center transition-colors',
          selected.length > 0 ? 'border-accent-strong text-text' : 'border-border-2 text-text-2 hover:border-border-2',
        )}
      >
        <span className="truncate flex-1">{summary}</span>
        <ChevronDown size={13} className="text-text-3 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-sh3 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-2 h-8">
              <Search size={13} className="text-text-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search owner…"
                className="flex-1 bg-transparent border-0 outline-none text-[12.5px] text-text"
              />
              {q && (
                <button onClick={() => setQ('')} className="text-text-3 hover:text-text"><X size={12} /></button>
              )}
            </div>
          </div>
          <div className="max-h-[240px] overflow-y-auto sc py-1">
            {matches.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-text-3">No users match</div>
            )}
            {matches.map((p) => {
              const on = selectedSet.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border-2 grid place-items-center flex-shrink-0',
                    on ? 'bg-accent-strong border-accent-strong text-cg-900' : 'border-border-2',
                  )}>
                    {on && <Check size={12} strokeWidth={3.5} />}
                  </span>
                  <span className="truncate flex-1">{p.full_name || p.email}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-surface-2/50">
            <button
              onClick={selectAll}
              disabled={matches.length === 0}
              className="text-[11.5px] font-bold text-text-3 hover:text-accent-ink disabled:opacity-40"
            >
              Select all
            </button>
            <button
              onClick={clear}
              disabled={selected.length === 0}
              className="text-[11.5px] font-bold text-text-3 hover:text-bad disabled:opacity-40"
            >
              Clear
            </button>
            <div className="ml-auto text-[11px] text-text-3 tnum">{selected.length} selected</div>
          </div>
        </div>
      )}
    </div>
  );
}

