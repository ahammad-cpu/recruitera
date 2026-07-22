import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { useMe } from '@/hooks/useMe';
import {
  useRequalificationRules, useUpsertRule, useDeleteRule, type RequalificationRule,
} from '@/hooks/useRequalificationRules';
import { LOSS_REASONS, LOSS_REASON_LABEL, type LossReason } from '@/hooks/useLoseAccount';
import { RuleEditorModal } from './RuleEditorModal';
import { cn } from '@/lib/cn';

const REASON_LABEL: Record<LossReason, string> = LOSS_REASON_LABEL;

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL', demo: 'Demo', proposal: 'Proposal',
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-surface-2 text-text-3 border-border',
  medium: 'bg-accent/10 text-accent-strong border-accent/30',
  high: 'bg-bad-bg text-bad border-bad/30',
};

export default function RequalificationSettings() {
  const me = useMe();
  const rules = useRequalificationRules();
  const upsert = useUpsertRule();
  const del = useDeleteRule();
  const [editing, setEditing] = useState<RequalificationRule | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState<RequalificationRule | null>(null);

  // ABAC gate — page is admin-only. Non-admins bounce to the dashboard.
  if (!me.isLoading && me.data?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  function reasonLabel(code: string | null) {
    if (!code) return 'Any reason';
    return REASON_LABEL[code as LossReason] ?? code;
  }

  function stagesLabel(stages: string[] | null) {
    if (!stages || stages.length === 0) return 'Any stage';
    return stages.map((s) => STAGE_LABEL[s] ?? s).join(', ');
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="text-[22px] font-black tracking-tight text-text">Requalification Rules</h1>
          <p className="text-[13px] text-text-3 font-medium mt-1">
            Automatically create a follow-up task on lost accounts after a delay, so nothing falls through the cracks.
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13.5px] font-bold hover:bg-accent-strong"
        >
          <Plus size={14} strokeWidth={2.5} /> New rule
        </button>
      </div>

      {rules.isLoading && <div className="p-7 text-[12.5px] text-text-3">Loading…</div>}

      {!rules.isLoading && (rules.data ?? []).length === 0 && (
        <div className="p-8 text-center rounded-2xl border border-dashed border-border text-[13px] text-text-3">
          No requalification rules yet. Create one to start following up on lost accounts automatically.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(rules.data ?? []).map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-black text-text truncate">{rule.name}</div>
                <div className="text-[11.5px] text-text-3 mt-0.5 flex items-center gap-1">
                  <Clock size={11} /> {rule.delay_days}d after loss · {reasonLabel(rule.reason_code)} · {stagesLabel(rule.from_stages)}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title={rule.enabled ? 'Enabled' : 'Disabled'}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={rule.enabled}
                  onChange={(e) => upsert.mutate({ id: rule.id, enabled: e.target.checked })}
                />
                <span
                  className={cn(
                    'w-9 h-5 rounded-full transition-colors flex items-center px-0.5',
                    rule.enabled ? 'bg-ok justify-end' : 'bg-surface-2 border border-border justify-start',
                  )}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow" />
                </span>
              </label>
            </div>

            <div className="text-[12px] text-text-2 bg-surface-2 rounded-lg px-3 py-2 truncate">
              {rule.task_title_tpl}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[10.5px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide', PRIORITY_STYLE[rule.task_priority] ?? PRIORITY_STYLE.medium)}>
                {rule.task_priority}
              </span>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border bg-surface-2 text-text-3">
                {rule.assignment_mode.replaceAll('_', ' ')}
              </span>
              {rule.fires_once && (
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border bg-surface-2 text-text-3">
                  fires once
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border mt-1">
              <button
                onClick={() => setEditing(rule)}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border bg-surface text-[12px] font-bold text-text-2 hover:bg-surface-2"
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(rule)}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-bad/30 bg-bad-bg text-[12px] font-bold text-bad hover:bg-bad-bg/70"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RuleEditorModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-6" onClick={() => setConfirmDelete(null)}>
          <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-[14px] font-black text-text">Delete "{confirmDelete.name}"?</div>
              <div className="text-[12px] text-text-3 mt-1">This cannot be undone.</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2">
                Cancel
              </button>
              <button
                onClick={() => { del.mutate(confirmDelete.id); setConfirmDelete(null); }}
                disabled={del.isPending}
                className="h-9 px-4 rounded-lg bg-bad text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
