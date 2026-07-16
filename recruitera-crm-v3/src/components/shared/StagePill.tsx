import { cn } from '@/lib/cn';

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL', demo: 'Demo', proposal: 'Proposal',
  won: 'Won', paid: 'Paid', lost: 'Lost',
};

// Colors are theme tokens (tailwind.config.mjs / src/index.css) — sql/demo
// match the Sales Pipeline board's own column colors exactly (they used to
// diverge: this badge showed different hues than the board for the same
// stage).
const STAGE_STYLE: Record<string, string> = {
  lead: 'bg-cg-100 text-cg-800',
  mql: 'bg-info-bg text-info',
  sql: 'bg-violet-bg text-violet',
  demo: 'bg-purple-bg text-purple',
  proposal: 'bg-warn-bg text-warn',
  won: 'bg-ok-bg text-ok',
  paid: 'bg-accent-soft text-accent-ink',
  lost: 'bg-bad-bg text-bad',
};

export function StagePill({ stage }: { stage: string | null }) {
  const key = (stage ?? 'lead').toLowerCase();
  return (
    <span className={cn('inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-bold', STAGE_STYLE[key] ?? STAGE_STYLE.lead)}>
      {STAGE_LABEL[key] ?? key}
    </span>
  );
}
