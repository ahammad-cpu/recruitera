import { useState } from 'react';
import { Send, MessageSquare, Phone, Mail, Calendar, CheckSquare } from 'lucide-react';
import { useLogActivity } from '@/hooks/useActivityMutations';
import { cn } from '@/lib/cn';

const TYPES = [
  { k: 'note', label: 'Note', icon: MessageSquare },
  { k: 'call', label: 'Call', icon: Phone },
  { k: 'email', label: 'Email', icon: Mail },
  { k: 'meeting', label: 'Meeting', icon: Calendar },
  { k: 'task', label: 'Task', icon: CheckSquare },
];

export function ActivityComposer({ accountId }: { accountId: string }) {
  const [type, setType] = useState('note');
  const [text, setText] = useState('');
  const log = useLogActivity(accountId);

  function submit() {
    const t = text.trim();
    if (!t) return;
    log.mutate({ type, text: t }, { onSuccess: () => setText('') });
  }

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1">
        {TYPES.map((tp) => {
          const Icon = tp.icon;
          const active = type === tp.k;
          return (
            <button
              key={tp.k}
              onClick={() => setType(tp.k)}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-semibold border transition-colors',
                active
                  ? 'bg-cg-900 text-white border-cg-900'
                  : 'bg-surface text-text-2 border-border hover:bg-surface-2',
              )}
            >
              <Icon size={12} />
              {tp.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }}
        rows={3}
        placeholder={`Log a ${type}… (⌘↵ to send)`}
        className="w-full bg-surface border border-border rounded-lg p-2.5 text-[13px] text-text outline-none focus:border-accent-strong resize-vertical"
      />
      <div className="flex items-center justify-end">
        <button
          onClick={submit}
          disabled={!text.trim() || log.isPending}
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-cg-900 text-white text-[12px] font-bold hover:bg-cg-800 disabled:opacity-50"
        >
          <Send size={12} />
          {log.isPending ? 'Logging…' : 'Log'}
        </button>
      </div>
    </div>
  );
}
