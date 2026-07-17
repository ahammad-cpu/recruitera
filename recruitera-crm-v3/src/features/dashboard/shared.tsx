import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/shared/Sparkline';

export type PeriodKind = 'month' | 'quarter' | 'year';
const PERIOD_OPTIONS: { key: PeriodKind; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

/**
 * Matches targets.period_kind ('month'|'quarter'|'year', already supported
 * server-side) so a target row keyed to any of the three granularities can
 * be looked up directly by (period_kind, period_start) without a migration.
 */
export function getPeriodRange(kind: PeriodKind, now: Date) {
  const year = now.getFullYear();
  let start: Date;
  let end: Date;
  let label: string;
  if (kind === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(year, q * 3, 1);
    end = new Date(year, q * 3 + 3, 0);
    label = `Q${q + 1} ${year}`;
  } else if (kind === 'year') {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
    label = String(year);
  } else {
    start = new Date(year, now.getMonth(), 1);
    end = new Date(year, now.getMonth() + 1, 0);
    label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10), label, daysLeft };
}

export function PeriodToggle({ value, onChange }: { value: PeriodKind; onChange: (k: PeriodKind) => void }) {
  return (
    <div className="flex gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
      {PERIOD_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'px-2.5 py-1 rounded text-[12px] font-semibold',
            value === o.key ? 'bg-surface text-text shadow-sh1' : 'text-text-3',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BannerStat({ label, value, hint, colorClass, muted }: { label: string; value: React.ReactNode; hint?: string; colorClass?: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3 mb-2">{label}</div>
      <div className={cn('tnum text-[30px] font-black tracking-tight', colorClass ?? (muted ? 'text-text-2' : 'text-text'))}>{value}</div>
      {hint && <div className="text-[11.5px] text-text-3 font-medium mt-1">{hint}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, accent, seed }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; seed: number }) {
  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-xl p-4 shadow-sh1">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" />}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
      <Sparkline seed={seed} accent={accent} />
    </div>
  );
}

export function Panel({
  title, badge, badgeAccent, hint, action, children,
}: {
  title: string;
  badge?: string;
  badgeAccent?: 'warn' | 'bad';
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {badge && (
          <span
            className={cn(
              'tnum inline-flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full border text-[12px] font-bold',
              badgeAccent === 'warn' ? 'bg-warn-bg border-warn/30 text-warn'
                : badgeAccent === 'bad' ? 'bg-bad-bg border-bad/30 text-bad'
                : 'bg-surface-2 border-border text-text',
            )}
          >
            {badge}
          </span>
        )}
        {hint && <span className="text-[13px] text-text-3 font-medium">{hint}</span>}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}
