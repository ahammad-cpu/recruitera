import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/shared/Sparkline';

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
