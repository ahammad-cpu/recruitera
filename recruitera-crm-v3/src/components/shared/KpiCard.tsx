import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function KpiCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'ok' | 'warn' | 'bad' | 'info' | 'accent';
  icon?: ReactNode;
}) {
  const ring: Record<string, string> = {
    ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', accent: 'text-accent-ink',
  };
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-sh1">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-3">{label}</div>
        {icon && <div className={cn('text-text-3', accent && ring[accent])}>{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-bold text-text tnum">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-text-3">{hint}</div>}
    </div>
  );
}
