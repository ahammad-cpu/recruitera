import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CreatableSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onCreate?: (v: string) => Promise<void> | void;
  placeholder?: string;
  creating?: boolean;
};

export function CreatableSelect({
  label, value, options, onChange, onCreate, placeholder, creating,
}: CreatableSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLLabelElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options),
    [needle, options],
  );
  const exact = options.some((o) => o.toLowerCase() === needle);
  const canCreate = !!onCreate && !!needle && !exact;

  async function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  async function create() {
    if (!onCreate || !needle) return;
    await onCreate(needle);
    onChange(needle);
    setOpen(false);
    setQ('');
  }

  return (
    <label ref={wrap} className="block relative">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface-2 text-[13px] text-left flex items-center justify-between hover:border-accent-strong"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !value && 'text-text-3')}>{value || placeholder || 'Select…'}</span>
        <span className="text-text-3 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 mt-1 w-full bg-surface border-2 border-accent rounded-xl shadow-sh3 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
              <Search size={13} className="text-text-3" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); if (canCreate) create(); else if (filtered[0]) pick(filtered[0]); }
                }}
                placeholder={`Search or add ${label.toLowerCase()}…`}
                className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
              />
            </div>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-accent-soft/60 hover:bg-accent-soft text-accent-ink text-[13px] font-bold border-b border-border disabled:opacity-60"
            >
              <Plus size={14} />
              {creating ? 'Adding…' : <>Add <span className="font-mono">"{needle}"</span></>}
            </button>
          )}

          <div className="max-h-[240px] overflow-y-auto sc py-1">
            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-4 text-center text-[12px] text-text-3">No options.</div>
            )}
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2 text-[13px]',
                  o === value && 'bg-accent-soft/40',
                )}
              >
                <span className="truncate">{o}</span>
                {o === value && <Check size={14} className="text-ok flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </label>
  );
}
