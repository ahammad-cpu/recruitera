import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Profile } from '@/hooks/useUsersData';

export type PipelineFilterState = {
  owners: string[];      // profile ids
  temps: string[];       // 'hot' | 'warm' | 'cold'
  minAcv: string;        // stringified number ('' = no filter)
  maxAcv: string;
  closeFrom: string;     // yyyy-mm-dd
  closeTo: string;
};

export const EMPTY_FILTERS: PipelineFilterState = {
  owners: [], temps: [], minAcv: '', maxAcv: '', closeFrom: '', closeTo: '',
};

export function filtersActiveCount(f: PipelineFilterState): number {
  let n = 0;
  if (f.owners.length) n++;
  if (f.temps.length) n++;
  if (f.minAcv) n++;
  if (f.maxAcv) n++;
  if (f.closeFrom) n++;
  if (f.closeTo) n++;
  return n;
}

export function filtersToParams(f: PipelineFilterState): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.owners.length) p.owners = f.owners.join(',');
  if (f.temps.length) p.temps = f.temps.join(',');
  if (f.minAcv) p.minAcv = f.minAcv;
  if (f.maxAcv) p.maxAcv = f.maxAcv;
  if (f.closeFrom) p.closeFrom = f.closeFrom;
  if (f.closeTo) p.closeTo = f.closeTo;
  return p;
}

export function filtersFromParams(sp: URLSearchParams): PipelineFilterState {
  return {
    owners:    sp.get('owners')?.split(',').filter(Boolean) ?? [],
    temps:     sp.get('temps')?.split(',').filter(Boolean) ?? [],
    minAcv:    sp.get('minAcv') ?? '',
    maxAcv:    sp.get('maxAcv') ?? '',
    closeFrom: sp.get('closeFrom') ?? '',
    closeTo:   sp.get('closeTo') ?? '',
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  value: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  profiles: Profile[];
};

const TEMPS: { key: 'hot' | 'warm' | 'cold'; label: string; cls: string }[] = [
  { key: 'hot',  label: 'Hot',  cls: 'bg-bad-bg text-bad border-bad/40' },
  { key: 'warm', label: 'Warm', cls: 'bg-warn-bg text-warn border-warn/40' },
  { key: 'cold', label: 'Cold', cls: 'bg-surface-2 text-text-3 border-border' },
];

export function PipelineFilters({ open, onClose, value, onChange, profiles }: Props) {
  if (!open) return null;

  const toggle = <K extends 'owners' | 'temps'>(k: K, id: string) => {
    const arr = value[k];
    const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    onChange({ ...value, [k]: next });
  };

  const active = filtersActiveCount(value);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 z-[90] w-[380px] bg-surface border-l border-border shadow-sh3 flex flex-col animate-[slideR_.2s]">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent-ink grid place-items-center">
            <Filter size={16} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-black text-text">Filters</div>
            <div className="text-[11.5px] text-text-3">{active === 0 ? 'None applied' : `${active} active`}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto sc p-5 space-y-6">
          {/* Owners */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Owner</div>
            <div className="max-h-[180px] overflow-y-auto sc space-y-1 border border-border rounded-lg p-1.5 bg-surface-2/60">
              {profiles.slice(0, 40).map((p) => {
                const on = value.owners.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle('owners', p.id)}
                    className={cn(
                      'w-full flex items-center gap-2 h-8 px-2 rounded-md text-left text-[12.5px]',
                      on ? 'bg-accent-soft text-accent-ink font-bold' : 'hover:bg-surface',
                    )}
                  >
                    <span className={cn('w-3 h-3 rounded border-2', on ? 'bg-accent-strong border-accent-strong' : 'border-border-2')} />
                    <span className="truncate">{p.full_name || p.email}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Temperature</div>
            <div className="flex gap-2">
              {TEMPS.map((t) => {
                const on = value.temps.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggle('temps', t.key)}
                    className={cn(
                      'h-9 px-4 rounded-full text-[12px] font-black tracking-wider border-2 transition',
                      on ? t.cls : 'bg-surface text-text-3 border-border hover:border-border-2',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACV range */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">ACV range (EGP)</div>
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="Min" value={value.minAcv} onChange={(v) => onChange({ ...value, minAcv: v })} />
              <NumInput label="Max" value={value.maxAcv} onChange={(v) => onChange({ ...value, maxAcv: v })} />
            </div>
          </div>

          {/* Close-date range — uses disqualified_at as proxy for closed deals */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Close date</div>
            <div className="grid grid-cols-2 gap-2">
              <DateInput label="From" value={value.closeFrom} onChange={(v) => onChange({ ...value, closeFrom: v })} />
              <DateInput label="To"   value={value.closeTo}   onChange={(v) => onChange({ ...value, closeTo: v })} />
            </div>
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-border bg-surface-2/50 flex items-center gap-2">
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            disabled={active === 0}
            className="h-10 px-4 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface disabled:opacity-40"
          >Reset</button>
          <button
            onClick={onClose}
            className="ml-auto h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong"
          >Apply</button>
        </footer>
      </aside>
    </>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-3">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
      />
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-3">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
      />
    </label>
  );
}
