import { cn } from '@/lib/cn';

/**
 * Shared visual primitives so every Reports tab uses the same shapes:
 * a thick BarList (label left, colored fill, big value right — matches the
 * v1 "Cycle by source" and "Sources" screenshots the user referenced),
 * a KPI tile with an optional trend-hint chip, and a Panel with a header
 * pill on the right.
 */

export function ReportPanel({
  title, subtitle, headerRight, children,
}: {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-3 flex-wrap px-6 pt-5 pb-4 border-b border-border/60">
        <div className="min-w-0">
          <div className="text-[10.5px] font-black uppercase tracking-[0.14em] text-text-3">
            {title}
          </div>
          {subtitle && (
            <div className="text-[15px] font-extrabold text-text tracking-tight mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {headerRight}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export function ReportKpi({
  label, value, sub, accent, tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
}) {
  const toneClass = tone === 'ok' ? 'text-ok'
    : tone === 'warn' ? 'text-warn'
    : tone === 'bad' ? 'text-bad'
    : tone === 'info' ? 'text-info'
    : 'text-text';
  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-xl p-4 shadow-sh1">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent-strong" />}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className={cn('tnum text-[24px] font-black tracking-tight mt-2', toneClass)}>{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-1">{sub}</div>}
    </div>
  );
}

export function HeaderPill({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'muted' }) {
  const c = tone === 'ok' ? 'bg-ok-bg text-ok'
    : tone === 'warn' ? 'bg-warn-bg text-warn'
    : tone === 'bad' ? 'bg-bad-bg text-bad'
    : tone === 'muted' ? 'bg-surface-2 text-text-3'
    : 'bg-accent-soft text-accent-ink';
  return (
    <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-black tracking-wide', c)}>
      {children}
    </span>
  );
}

/**
 * Thick horizontal bar rows — the visual pattern the user asked for.
 * Each row: label left, colored track bar, right-aligned value.
 * `variant='full'` = 100%-width track with a proportional fill (used for
 * distributions, "% of total" charts). `variant='raw'` = fill only,
 * proportional to the row's value relative to `max` (used for absolute
 * counts like accounts or days).
 */
export type BarRow = {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  rightHint?: string;
  fillClass?: string;   // Tailwind bg class, defaults to bg-accent-strong
  labelHint?: string;   // small secondary text under the label
};

const DEFAULT_PALETTE = [
  'bg-accent-strong', 'bg-info', 'bg-purple', 'bg-cg-800',
  'bg-warn', 'bg-ok', 'bg-flame', 'bg-cyan', 'bg-violet',
];

export function BarList({
  rows, max, variant = 'raw', emptyText = 'No data.', autoColor = false,
}: {
  rows: BarRow[];
  max?: number;
  variant?: 'full' | 'raw';
  emptyText?: string;
  autoColor?: boolean;
}) {
  if (rows.length === 0) {
    return <div className="py-6 text-center text-[12.5px] text-text-3">{emptyText}</div>;
  }
  const denom = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-4">
      {rows.map((r, i) => {
        const pct = variant === 'full' ? Math.min(100, r.value) : Math.min(100, (r.value / denom) * 100);
        const fill = r.fillClass || (autoColor ? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] : 'bg-accent-strong');
        return (
          <div key={r.key}>
            <div className="flex items-baseline gap-3 mb-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-extrabold text-text truncate">{r.label}</div>
                {r.labelHint && <div className="text-[11px] text-text-3 truncate">{r.labelHint}</div>}
              </div>
              <div className="tnum text-[14px] font-black text-text whitespace-nowrap">{r.displayValue}</div>
              {r.rightHint && <div className="tnum text-[11.5px] text-text-3 whitespace-nowrap">{r.rightHint}</div>}
            </div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A conversion-funnel-shaped bar (label on colored track, wider = more).
 * Matches the v1 screenshot: pastel-tinted rows with the count centered
 * within the fill and % on the right.
 */
export type FunnelRow = {
  key: string;
  label: string;
  count: number;
  pctOfTotal: number;
  fillClass?: string;
};

export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const w = Math.max(6, (r.count / max) * 100);
        return (
          <div key={r.key} className="relative h-11 rounded-xl bg-surface-2 overflow-hidden">
            <div
              className={cn('absolute inset-y-0 left-0 rounded-xl', r.fillClass || 'bg-accent-soft')}
              style={{ width: `${w}%` }}
            />
            <div className="relative h-full flex items-center gap-3 px-4">
              <span className="text-[13.5px] font-extrabold text-text uppercase tracking-wide flex-1">{r.label}</span>
              <span className="tnum text-[15px] font-black text-text">{r.count}</span>
              <span className="tnum text-[11px] text-text-3 w-10 text-right">{Math.round(r.pctOfTotal)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
