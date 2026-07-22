import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { LOSS_REASONS, LOSS_REASON_LABEL, type LossReason } from '@/hooks/useLoseAccount';
import { useProfiles } from '@/hooks/useUsersData';
import {
  ASSIGNMENT_MODES, REQUAL_STAGES, TASK_PRIORITIES, useUpsertRule,
  type AssignmentMode, type RequalificationRule, type RequalStage, type TaskPriority,
} from '@/hooks/useRequalificationRules';
import { cn } from '@/lib/cn';

type Props = { rule: RequalificationRule | null; onClose: () => void };

const REASON_LABEL: Record<LossReason, string> = LOSS_REASON_LABEL;

const STAGE_LABEL: Record<RequalStage, string> = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL', demo: 'Demo', proposal: 'Proposal',
};

const MODE_LABEL: Record<AssignmentMode, string> = {
  same_owner: 'Same owner',
  original_owner: 'Original owner (at time of loss)',
  round_robin_pool: 'Round-robin across a pool',
  round_robin_excluding_original_owner: 'Round-robin, excluding original owner',
  specific_user: 'Specific user',
};

const MODE_HINT: Record<AssignmentMode, string> = {
  same_owner: 'Task goes to whoever currently owns the account',
  original_owner: 'Task goes to whoever owned it when it was lost',
  round_robin_pool: 'Cycles through the selected pool of users',
  round_robin_excluding_original_owner: 'Cycles through the pool, skipping the original owner',
  specific_user: 'Always assign to one fixed person',
};

export function RuleEditorModal({ rule, onClose }: Props) {
  const upsert = useUpsertRule();
  const profiles = useProfiles();

  const [name, setName] = useState(rule?.name ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [reasonCode, setReasonCode] = useState<string>(rule?.reason_code ?? '');
  const [anyStage, setAnyStage] = useState(!rule?.from_stages || rule.from_stages.length === 0);
  const [stages, setStages] = useState<Set<string>>(new Set(rule?.from_stages ?? []));
  const [delayDays, setDelayDays] = useState(String(rule?.delay_days ?? 30));
  const [titleTpl, setTitleTpl] = useState(rule?.task_title_tpl ?? 'Re-engage {{company_name}} — {{days_ago}}d since lost');
  const [priority, setPriority] = useState<TaskPriority>(rule?.task_priority ?? 'medium');
  const [mode, setMode] = useState<AssignmentMode>(rule?.assignment_mode ?? 'same_owner');
  const [pool, setPool] = useState<Set<string>>(new Set(rule?.assignee_pool ?? []));
  const [specificAssignee, setSpecificAssignee] = useState(rule?.specific_assignee ?? '');
  const [firesOnce, setFiresOnce] = useState(rule?.fires_once ?? true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleStage(s: string) {
    setStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  function togglePoolMember(id: string) {
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const needsPool = mode === 'round_robin_pool' || mode === 'round_robin_excluding_original_owner';
  const needsSpecific = mode === 'specific_user';

  async function submit() {
    setErr(null);
    if (!name.trim()) { setErr('Name is required'); return; }
    const delay = Number(delayDays);
    if (!Number.isFinite(delay) || delay < 0) { setErr('Delay (days) must be a non-negative number'); return; }
    if (!titleTpl.trim()) { setErr('Task title template is required'); return; }
    if (needsSpecific && !specificAssignee) { setErr('Pick a specific assignee'); return; }

    try {
      await upsert.mutateAsync({
        ...(rule ? { id: rule.id } : {}),
        name: name.trim(),
        enabled,
        reason_code: reasonCode || null,
        from_stages: anyStage ? null : Array.from(stages),
        delay_days: delay,
        task_title_tpl: titleTpl.trim(),
        task_priority: priority,
        assignment_mode: mode,
        assignee_pool: needsPool ? Array.from(pool) : [],
        specific_assignee: needsSpecific ? specificAssignee : null,
        fires_once: firesOnce,
      });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-sh3 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">{rule ? 'Edit rule' : 'New requalification rule'}</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Automatically creates a follow-up task on lost accounts after a delay</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-5 overflow-y-auto">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 60-day no-response nudge"
              className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            />
          </Field>

          <ToggleRow
            checked={enabled}
            onChange={setEnabled}
            title="Enabled"
            sub="Disabled rules never fire, but stay saved for later"
          />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Loss reason">
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              >
                <option value="">Any reason</option>
                {LOSS_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label="Delay (days after loss)">
              <input
                type="number"
                min={0}
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
                className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong tnum"
              />
            </Field>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">From stages</div>
            <div className="flex flex-wrap gap-2">
              <StagePill label="Any stage" active={anyStage} onClick={() => setAnyStage(true)} />
              {REQUAL_STAGES.map((s) => (
                <StagePill
                  key={s}
                  label={STAGE_LABEL[s]}
                  active={!anyStage && stages.has(s)}
                  onClick={() => { setAnyStage(false); toggleStage(s); }}
                />
              ))}
            </div>
          </div>

          <Field label="Task title template">
            <input
              value={titleTpl}
              onChange={(e) => setTitleTpl(e.target.value)}
              className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            />
            <div className="text-[11px] text-text-3 mt-1 leading-snug">
              Vars: <code className="tnum">{'{{company_name}}'}</code>, <code className="tnum">{'{{lost_from_stage}}'}</code>,{' '}
              <code className="tnum">{'{{original_owner}}'}</code>, <code className="tnum">{'{{days_ago}}'}</code>,{' '}
              <code className="tnum">{'{{original_loss_notes}}'}</code>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Task priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              >
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Assignment mode">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AssignmentMode)}
                className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              >
                {ASSIGNMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </Field>
          </div>
          <div className="text-[11px] text-text-3 -mt-3">{MODE_HINT[mode]}</div>

          {needsPool && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Assignee pool</div>
              <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {(profiles.data ?? []).map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={pool.has(p.id)}
                      onChange={() => togglePoolMember(p.id)}
                      className="w-4 h-4 accent-accent-strong"
                    />
                    <span className="text-[13px] font-medium text-text">{p.full_name || p.email}</span>
                  </label>
                ))}
                {profiles.isLoading && <div className="px-3 py-2 text-[12px] text-text-3">Loading…</div>}
                {!profiles.isLoading && (profiles.data ?? []).length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-text-3">No users found</div>
                )}
              </div>
            </div>
          )}

          {needsSpecific && (
            <Field label="Specific assignee">
              <select
                value={specificAssignee}
                onChange={(e) => setSpecificAssignee(e.target.value)}
                className="w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              >
                <option value="">Select a user…</option>
                {(profiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </Field>
          )}

          <ToggleRow
            checked={firesOnce}
            onChange={setFiresOnce}
            title="Fires once"
            sub="Once triggered for an account, this rule won't fire again for it"
          />

          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={upsert.isPending}
            className="h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12.5px] font-black hover:bg-accent-strong disabled:opacity-60"
          >
            {upsert.isPending ? 'Saving…' : 'Save rule'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StagePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[12.5px] font-bold px-3 py-1.5 rounded-full border transition-colors',
        active ? 'border-accent-strong bg-accent text-cg-900' : 'border-border bg-surface text-text-2 hover:bg-surface-2',
      )}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  checked, onChange, title, sub,
}: {
  checked: boolean; onChange: (v: boolean) => void; title: string; sub: string;
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors',
      checked ? 'border-ok bg-ok-bg/50' : 'border-border bg-surface hover:border-border-2',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-md border-2 grid place-items-center flex-shrink-0 mt-0.5',
        checked ? 'bg-ok border-ok text-white' : 'border-border-2 bg-surface',
      )}>
        {checked && <Check size={13} strokeWidth={3.5} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-black text-text">{title}</div>
        <div className="text-[12px] text-text-2 mt-0.5 leading-snug">{sub}</div>
      </div>
    </label>
  );
}
