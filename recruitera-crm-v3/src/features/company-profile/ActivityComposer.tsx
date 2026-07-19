import { useMemo, useRef, useState } from 'react';
import { Mail, MessageCircle, Phone as PhoneIcon } from 'lucide-react';
import { useLogActivity } from '@/hooks/useActivityMutations';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import type { Profile } from '@/hooks/useUsersData';
import { cn } from '@/lib/cn';

/**
 * Shared note/call/email/whatsapp composer — used by both the Overview tab's
 * Internal Notes card and the History tab. Extracted so both surfaces log
 * activity through the exact same UI + mention-resolution logic instead of
 * drifting into two implementations.
 */
export function ActivityComposer({ accountId, profiles }: { accountId: string; profiles: Profile[] }) {
  const [type, setType] = useState<'call' | 'email' | 'whatsapp' | 'note'>('call');
  const [text, setText] = useState('');
  const [mention, setMention] = useState<{ query: string; start: number; idx: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const log = useLogActivity(accountId);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return profiles
      .filter((p) => (p.full_name || p.email || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, profiles]);

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    // find `@word` ending at caret with no whitespace between @ and caret
    const before = v.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
    if (m) {
      setMention({ query: m[2], start: caret - m[2].length - 1, idx: 0 });
    } else {
      setMention(null);
    }
  }

  function insertMention(p: Profile) {
    if (!mention) return;
    const name = (p.full_name || p.email || '').replace(/\s+/g, ' ');
    const insert = `@${name} `;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const next = before + insert + after;
    setText(next);
    setMention(null);
    // restore caret after the inserted mention
    requestAnimationFrame(() => {
      const pos = (before + insert).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention({ ...mention, idx: (mention.idx + 1) % mentionMatches.length }); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMention({ ...mention, idx: (mention.idx - 1 + mentionMatches.length) % mentionMatches.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mention.idx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setMention(null); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    // The composer only highlights @mentions visually — resolve them here
    // against the loaded profile list so the DB mention trigger (which reads
    // activities.mentions, not the raw text) actually fires and emails the
    // right people.
    const lower = t.toLowerCase();
    const handles = new Set<string>();
    for (const p of profiles) {
      const prefix = (p.email || '').split('@')[0].toLowerCase();
      const fullName = (p.full_name || '').toLowerCase();
      if (prefix && lower.includes(`@${prefix}`)) handles.add(prefix);
      else if (fullName && lower.includes(`@${fullName}`)) handles.add(prefix || fullName.replace(/\s+/g, ''));
    }
    log.mutate({ type, text: t, mentions: [...handles] }, { onSuccess: () => setText('') });
  }

  const CHANNELS: { id: 'call' | 'email' | 'whatsapp'; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'call',     label: 'Call',     Icon: PhoneIcon },
    { id: 'email',    label: 'Email',    Icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  ];

  return (
    <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2">
        {CHANNELS.map(({ id, label, Icon }) => {
          const active = type === id;
          return (
            <button
              key={id}
              onClick={() => setType(id)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-bold border transition-colors',
                active
                  ? 'bg-accent-soft text-accent-ink border-accent-strong'
                  : 'bg-surface text-text-2 border-border hover:border-border-2',
              )}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <div className="relative mt-3">
        <textarea
          ref={taRef}
          value={text}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
          rows={5}
          placeholder="What happened? Use @ to mention or @name/task to assign…"
          className="w-full bg-surface border border-border rounded-xl p-4 text-[14px] text-text placeholder:text-text-3 outline-none focus:border-accent-strong resize-vertical min-h-[130px]"
        />
        {mention && mentionMatches.length > 0 && (
          <div className="absolute left-3 top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-sh3 w-[280px] overflow-hidden">
            {mentionMatches.map((p, i) => (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]',
                  i === mention.idx ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <OwnerAvatar profile={p} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text truncate">{p.full_name || p.email}</div>
                  {p.full_name && p.email && <div className="text-[11px] text-text-3 truncate">{p.email}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end mt-3">
        <button
          onClick={submit}
          disabled={!text.trim() || log.isPending}
          className="h-11 px-6 rounded-xl bg-accent text-cg-900 text-[14px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
        >
          {log.isPending ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </div>
  );
}
