import { useMemo, useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
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
            label="Closed between"
            from={draft.closeFrom}
            to={draft.closeTo}
            onFrom={(v) => setDraft((d) => ({ ...d, closeFrom: v }))}
            onTo={(v) => setDraft((d) => ({ ...d, closeTo: v }))}
          />
        </div>

        <div className="flex-1 min-w-[180px] max-w-[240px]">
          <Field label="Sales Owner">
            <select
              value={draft.owners[0] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, owners: e.target.value ? [e.target.value] : [] }))}
              className="w-full h-10 pl-3 pr-8 bg-surface border border-border-2 rounded-lg text-[13px] font-semibold text-text outline-none focus:border-accent-strong appearance-none"
            >
              <option value="">All owners</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex-1 min-w-[160px] max-w-[200px]">
          <Field label="Temperature">
            <select
              value={draft.temps[0] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, temps: e.target.value ? [e.target.value] : [] }))}
              className="w-full h-10 pl-3 pr-8 bg-surface border border-border-2 rounded-lg text-[13px] font-semibold text-text outline-none focus:border-accent-strong appearance-none"
            >
              <option value="">All temperatures</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>
          </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-1.5">{label}</div>
      <div className="relative">
        {children}
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3" />
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

