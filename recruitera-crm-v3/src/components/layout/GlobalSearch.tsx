import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, CheckSquare, ChevronRight } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useTasks } from '@/hooks/useTasks';
import { cn } from '@/lib/cn';

type Hit =
  | { kind: 'company'; id: string; label: string; sub: string; to: string }
  | { kind: 'task'; id: string; label: string; sub: string; to: string };

const MAX_PER_GROUP = 6;

/**
 * In-memory search across every account (name/domain/am_mail) and every
 * task (title/text). Both hooks are already fetched at app load so this
 * is instant, no debounce needed — it operates on cached React Query
 * data. Contacts search is a follow-up (needs its own "all contacts"
 * hook + Supabase query). Cmd/Ctrl+K focuses the input; Escape/click-
 * outside closes; ↑↓+Enter navigates.
 */
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const accts = useAccounts();
  const tasks = useTasks();

  // Global ⌘K / Ctrl+K binding
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Click-outside closes
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const hits: Hit[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];

    const companyHits: Hit[] = [];
    for (const a of accts.data ?? []) {
      if (a.merged_into) continue;
      const name = (a.name || '').toLowerCase();
      const domain = (a.domain || '').toLowerCase();
      const am = (a.am_mail || '').toLowerCase();
      if (name.includes(query) || domain.includes(query) || am.includes(query)) {
        companyHits.push({
          kind: 'company',
          id: a.id,
          label: a.name || a.domain || 'Untitled company',
          sub: a.domain || a.am_mail || '',
          to: `/companies/${a.id}`,
        });
        if (companyHits.length >= MAX_PER_GROUP) break;
      }
    }

    const acctById = new Map((accts.data ?? []).map((a) => [a.id, a]));
    const taskHits: Hit[] = [];
    for (const t of tasks.data ?? []) {
      if (t.task_done) continue;
      const title = (t.title || '').toLowerCase();
      const text = (t.text || '').toLowerCase();
      if (title.includes(query) || text.includes(query)) {
        const acct = t.account_id ? acctById.get(t.account_id) : null;
        taskHits.push({
          kind: 'task',
          id: t.id,
          label: t.title || t.text || '(untitled task)',
          sub: acct ? (acct.name || acct.domain || '') : 'No company',
          to: t.account_id ? `/companies/${t.account_id}` : '/tasks',
        });
        if (taskHits.length >= MAX_PER_GROUP) break;
      }
    }

    return [...companyHits, ...taskHits];
  }, [q, accts.data, tasks.data]);

  // Reset active index whenever hits change
  useEffect(() => { setActive(0); }, [q]);

  function select(h: Hit) {
    setOpen(false);
    setQ('');
    navigate(h.to);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); select(hits[active]); }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 w-[340px]">
        <Search size={14} className="text-text-3" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search companies, contacts, tasks…"
          className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
        />
        <span className="text-[10px] font-bold text-text-3 bg-surface border border-border rounded px-1.5 py-0.5 tracking-wider">⌘K</span>
      </div>

      {showDropdown && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[420px] max-h-[420px] overflow-y-auto bg-surface border border-border rounded-xl shadow-sh3 z-50">
          {hits.length === 0 && (
            <div className="p-6 text-center text-[12.5px] text-text-3">
              No matches for “{q}”.
            </div>
          )}
          {hits.length > 0 && (
            <div className="py-1">
              {hits.map((h, i) => {
                const Icon = h.kind === 'company' ? Building2 : CheckSquare;
                const isActive = i === active;
                return (
                  <button
                    key={`${h.kind}:${h.id}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(h)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                      isActive ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                    )}
                  >
                    <Icon size={14} className={h.kind === 'company' ? 'text-accent-ink' : 'text-info'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-text truncate">{h.label}</div>
                      {h.sub && <div className="text-[11.5px] text-text-3 truncate">{h.sub}</div>}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-4">{h.kind}</span>
                    <ChevronRight size={12} className="text-text-4" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-border px-3 py-1.5 flex items-center justify-between text-[10.5px] text-text-4 font-semibold">
            <span>↑↓ navigate · ↵ open · Esc close</span>
            <span>{hits.length} result{hits.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
