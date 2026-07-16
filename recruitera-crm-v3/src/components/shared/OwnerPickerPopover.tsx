import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { Profile } from '@/hooks/useUsersData';
import { OwnerAvatar } from './OwnerAvatar';
import { cn } from '@/lib/cn';

export type OwnerPickerPopoverProps = {
  profiles: Profile[];
  currentId: string | null | undefined;
  onSelect: (profile: Profile | null) => void;
  onClose: () => void;
  placement?: 'bottom' | 'top';
  align?: 'left' | 'right';
};

export function OwnerPickerPopover({ profiles, currentId, onSelect, onClose, placement = 'bottom', align = 'left' }: OwnerPickerPopoverProps) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    // Defensive — a null profile in the list would crash the row map via key={p.id}.
    const safe = (profiles ?? []).filter((p): p is Profile => !!p && !!p.id);
    const needle = q.trim().toLowerCase();
    if (!needle) return safe;
    return safe.filter((p) =>
      (p.full_name || '').toLowerCase().includes(needle) ||
      (p.email || '').toLowerCase().includes(needle),
    );
  }, [q, profiles]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Select owner"
      className={cn(
        'absolute z-[60] w-[320px] bg-surface border-2 border-accent rounded-2xl shadow-sh3 overflow-hidden',
        placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
        align === 'right' ? 'right-0' : 'left-0',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2.5 border-b border-border">
        <div className="flex items-center gap-2 bg-surface-2 border-2 border-accent rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-text-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search user…"
            className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
            aria-label="Search users"
          />
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto sc py-1">
        <OwnerRow
          checked={!currentId}
          onClick={() => { onSelect(null); onClose(); }}
          avatar={
            <div className="w-9 h-9 rounded-full bg-text-4 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">?</div>
          }
          title="Unassigned"
        />
        {filtered.map((p) => (
          <OwnerRow
            key={p.id}
            checked={p.id === currentId}
            onClick={() => { onSelect(p); onClose(); }}
            avatar={<OwnerAvatar profile={p} size={36} />}
            title={p.full_name || p.email || '—'}
            subtitle={p.email ?? undefined}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-text-3">No users match.</div>
        )}
      </div>
    </div>
  );
}

function OwnerRow({
  checked, onClick, avatar, title, subtitle,
}: {
  checked: boolean;
  onClick: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 transition-colors',
        checked && 'bg-accent-soft/40',
      )}
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-text truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-text-3 truncate">{subtitle}</div>}
      </div>
      {checked && <Check size={16} className="text-ok flex-shrink-0" />}
    </button>
  );
}
