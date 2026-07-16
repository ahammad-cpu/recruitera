import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tag } from '@/hooks/useTags';

type Props = {
  allTags: Tag[];
  attachedIds: Set<string>;
  onAttach: (tagId: string) => void;
  onDetach: (tagId: string) => void;
  onCreate: (label: string) => Promise<Tag>;
  onClose: () => void;
  placement?: 'bottom' | 'top';
  align?: 'left' | 'right';
};

export function TagPickerPopover({
  allTags, attachedIds, onAttach, onDetach, onCreate, onClose,
  placement = 'bottom', align = 'left',
}: Props) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return allTags;
    return allTags.filter((t) => t.label.toLowerCase().includes(query));
  }, [allTags, query]);

  const exactExists = query && allTags.some((t) => t.label.toLowerCase() === query);
  const showCreate = query.length > 0 && !exactExists;

  async function handleCreate() {
    if (!query || creating) return;
    try {
      setCreating(true);
      const t = await onCreate(query);
      onAttach(t.id);
      setQ('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute z-[70] w-[300px] bg-surface border border-border rounded-xl shadow-sh3 overflow-hidden',
        placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      <div className="text-center py-2.5 border-b border-border font-black text-[13px] text-text">Search tags</div>
      <div className="p-2.5">
        <div className="flex items-center gap-2 h-10 px-3 border-2 border-accent rounded-lg bg-surface">
          <Search size={14} className="text-text-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && showCreate) handleCreate(); }}
            placeholder="Search…"
            className="flex-1 bg-transparent border-0 outline-none text-[13px]"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-text-3 hover:text-text">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[240px] overflow-y-auto pb-2">
        {matches.map((t) => {
          const attached = attachedIds.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => (attached ? onDetach(t.id) : onAttach(t.id))}
              className="w-full flex items-center gap-2 px-4 py-2 text-left text-[13.5px] hover:bg-surface-2"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: t.color || 'rgb(var(--accent))' }}
              />
              <span className={cn('flex-1 truncate', attached ? 'font-black text-text' : 'font-semibold text-text-2')}>
                {t.label}
              </span>
              {attached && <span className="text-[10px] font-black uppercase tracking-wider text-accent-ink">on</span>}
            </button>
          );
        })}

        {showCreate && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full flex flex-col items-start gap-0.5 px-4 py-2.5 bg-accent-soft/60 hover:bg-accent-soft text-left disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5 font-black text-[13.5px] text-text">
              <Plus size={13} /> {creating ? 'Creating…' : 'Create new tag'}
            </span>
            <span className="text-[12px] text-text-3 truncate max-w-full">{q}</span>
          </button>
        )}

        {matches.length === 0 && !showCreate && (
          <div className="px-4 py-6 text-center text-[12px] text-text-3">No tags yet</div>
        )}
      </div>
    </div>
  );
}
