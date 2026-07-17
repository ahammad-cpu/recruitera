import { useEffect, useRef, useState } from 'react';
import { X, Download, Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCreateAccount, type NewAccountInput } from '@/hooks/useCreateAccount';
import { useMe } from '@/hooks/useMe';
import { useProfiles } from '@/hooks/useUsersData';
import { cn } from '@/lib/cn';

type Props = { onClose: () => void };

const TEMPLATE_HEADERS = [
  'company_name',
  'source',
  'stage',
  'campaign',
  'medium',
  'am_email',
  'cs_email',
  'industry',
  'company_size',
  'domain',
  'contact_name',
  'contact_phone',
  'contact_email',
  'contact_job_title',
] as const;

const SAMPLE_ROW = [
  'Hassan Allam Holding',
  'LinkedIn',
  'lead',
  'Q3-Enterprise-2026',
  'social',
  'a.hammad@icareer.ai',
  'cs@recruitera.ai',
  'Construction',
  '500-1000',
  'hassanallam.com',
  'Nour Adel',
  '+20 100 111 2222',
  'nour@hassanallam.com',
  'HR Director',
];

function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const v = cell ?? '';
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(','),
    )
    .join('\n');
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

function downloadTemplate() {
  const csv = toCsv([TEMPLATE_HEADERS as unknown as string[], SAMPLE_ROW]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recruitera-companies-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Step = 'intro' | 'preview' | 'running' | 'done';
type ParsedRow = { row: Record<string, string>; input: NewAccountInput; error?: string };

export function BulkUploadModal({ onClose }: Props) {
  const me = useMe();
  const profiles = useProfiles();
  const isAdmin = me.data?.role === 'admin';
  const create = useCreateAccount();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [progress, setProgress] = useState({ done: 0, ok: 0, failed: 0 });
  // Admins add companies on behalf of the team, so bulk uploads require an
  // explicit "assign to" choice instead of silently defaulting every row
  // to the admin's own email (same rule as the single Add Company form).
  const [bulkOwnerId, setBulkOwnerId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'running') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  async function onPickFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    const raw = parseCsv(text);
    const fallbackOwner = isAdmin
      ? (profiles.data ?? []).find((p) => p.id === bulkOwnerId)
      : me.data;
    const uploaderName = me.data?.full_name || me.data?.email || 'a user';
    const parsed: ParsedRow[] = raw.map((r) => {
      const err: string[] = [];
      if (!r.company_name) err.push('company_name missing');
      if (!r.contact_name) err.push('contact_name missing');
      if (!r.contact_phone) err.push('contact_phone missing');
      const input: NewAccountInput = {
        name: r.company_name || '',
        source: r.source || `Manually added by ${uploaderName}`,
        stage: (r.stage || 'lead').toLowerCase(),
        campaign: r.campaign || null,
        medium: r.medium || null,
        am_mail: r.am_email || fallbackOwner?.email || null,
        owner_id: fallbackOwner?.id ?? null,
        cs_email: r.cs_email || null,
        industry: r.industry || null,
        company_size: r.company_size || null,
        domain: r.domain || null,
        contact: {
          full_name: r.contact_name || '',
          phone: r.contact_phone || '',
          email: r.contact_email || null,
          job_title: r.contact_job_title || null,
        },
      };
      return { row: r, input, error: err.length ? err.join(', ') : undefined };
    });
    setRows(parsed);
    setStep('preview');
  }

  async function runImport() {
    const good = rows.filter((r) => !r.error);
    if (!good.length) return;
    setStep('running');
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < good.length; i++) {
      try {
        await create.mutateAsync(good[i].input);
        ok++;
      } catch (e) {
        failed++;
        console.warn('[bulk-upload] row failed', good[i].input.name, e);
      }
      setProgress({ done: i + 1, ok, failed });
    }
    setStep('done');
    toast.success(`Imported ${ok} companies${failed ? ` · ${failed} failed` : ''}`);
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (step !== 'running' && e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col my-8">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center text-cg-900">
            <Upload size={18} strokeWidth={3} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-black tracking-tight text-text">Bulk upload companies</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">
              {step === 'intro' && 'Download the template, fill it, and re-upload.'}
              {step === 'preview' && `${fileName} · ${validCount} valid, ${errorCount} skipped`}
              {step === 'running' && `Importing ${progress.done} of ${validCount}…`}
              {step === 'done' && `${progress.ok} imported, ${progress.failed} failed`}
            </div>
          </div>
          {step !== 'running' && (
            <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
          )}
        </header>

        <div className="p-6 overflow-y-auto sc flex-1">
          {step === 'intro' && (
            <div className="space-y-5">
              <StepBox
                num={1}
                title="Download the template"
                desc="A CSV with the exact column names we expect. Row 1 = headers, Row 2 = sample. Delete row 2 before uploading real data."
                action={
                  <button
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-cg-900 text-white text-[13px] font-bold hover:bg-cg-800"
                  >
                    <Download size={14} /> Download template.csv
                  </button>
                }
              />
              <StepBox
                num={2}
                title="Fill in your data"
                desc={`Required columns: company_name, contact_name, contact_phone. Everything else is optional.`}
              />
              {isAdmin && (
                <StepBox
                  num={3}
                  title="Assign to"
                  desc="Rows without an am_email column fall back to this person. Required for admin uploads instead of silently defaulting to you."
                  action={
                    <select
                      value={bulkOwnerId}
                      onChange={(e) => setBulkOwnerId(e.target.value)}
                      className={cn(
                        'h-10 px-3 border-2 rounded-lg bg-surface text-[13px] font-semibold outline-none w-full max-w-xs',
                        bulkOwnerId ? 'border-border-2' : 'border-bad/50',
                      )}
                    >
                      <option value="">Select owner…</option>
                      {(profiles.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  }
                />
              )}
              <StepBox
                num={isAdmin ? 4 : 3}
                title="Upload the filled sheet"
                desc="Drop the CSV below or click to browse. We'll preview before inserting."
                action={
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      disabled={isAdmin && !bulkOwnerId}
                      onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
                    />
                    <div
                      onClick={() => { if (!isAdmin || bulkOwnerId) fileRef.current?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (isAdmin && !bulkOwnerId) return;
                        const f = e.dataTransfer.files?.[0];
                        if (f) onPickFile(f);
                      }}
                      className={cn(
                        'mt-2 border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors',
                        isAdmin && !bulkOwnerId
                          ? 'border-border-2 opacity-50 cursor-not-allowed'
                          : 'border-border-2 hover:border-accent hover:bg-accent-soft/40 cursor-pointer',
                      )}
                    >
                      <FileSpreadsheet size={28} className="mx-auto text-text-3 mb-2" />
                      <div className="text-[13px] font-bold text-text">
                        {isAdmin && !bulkOwnerId ? 'Pick an owner above first' : 'Drop CSV here or click to browse'}
                      </div>
                      <div className="text-[11px] text-text-3 mt-1">Max ~500 rows. .csv only.</div>
                    </div>
                  </>
                }
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-bold text-ok bg-ok-bg px-2.5 py-1 rounded-md">
                  <Check size={13} /> {validCount} valid
                </span>
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-bold text-bad bg-bad-bg px-2.5 py-1 rounded-md">
                    <AlertCircle size={13} /> {errorCount} skipped
                  </span>
                )}
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="max-h-[360px] overflow-y-auto sc">
                  <table className="w-full text-[12px]">
                    <thead className="bg-surface-2 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-text-3 uppercase tracking-wider text-[10px]">#</th>
                        <th className="text-left px-3 py-2 font-bold text-text-3 uppercase tracking-wider text-[10px]">Company</th>
                        <th className="text-left px-3 py-2 font-bold text-text-3 uppercase tracking-wider text-[10px]">Contact</th>
                        <th className="text-left px-3 py-2 font-bold text-text-3 uppercase tracking-wider text-[10px]">Phone</th>
                        <th className="text-left px-3 py-2 font-bold text-text-3 uppercase tracking-wider text-[10px]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={r.error ? 'bg-bad-bg/40' : ''}>
                          <td className="px-3 py-2 text-text-3">{i + 1}</td>
                          <td className="px-3 py-2 font-semibold text-text truncate max-w-[180px]">{r.input.name || '—'}</td>
                          <td className="px-3 py-2 text-text-2 truncate max-w-[140px]">{r.input.contact.full_name || '—'}</td>
                          <td className="px-3 py-2 text-text-2 truncate max-w-[120px]">{r.input.contact.phone || '—'}</td>
                          <td className="px-3 py-2">
                            {r.error ? (
                              <span className="text-bad text-[11px] font-semibold">{r.error}</span>
                            ) : (
                              <span className="text-ok text-[11px] font-bold">ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button
                onClick={() => { setRows([]); setFileName(''); setStep('intro'); }}
                className="text-[12px] text-text-3 hover:text-text underline"
              >
                Pick a different file
              </button>
            </div>
          )}

          {step === 'running' && (
            <div className="py-10 space-y-4">
              <div className="text-center text-[13px] font-semibold text-text">
                Inserting {progress.done} / {validCount}…
              </div>
              <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: validCount ? `${(progress.done / validCount) * 100}%` : '0%' }}
                />
              </div>
              <div className="text-center text-[11px] text-text-3">
                {progress.ok} ok · {progress.failed} failed
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-ok-bg text-ok grid place-items-center mx-auto">
                <Check size={28} strokeWidth={3} />
              </div>
              <div className="text-[15px] font-black text-text">Import complete</div>
              <div className="text-[12px] text-text-3">
                {progress.ok} imported {progress.failed > 0 ? `· ${progress.failed} failed (see browser console)` : ''}
              </div>
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          {step === 'preview' && (
            <>
              <button onClick={onClose} className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface">Cancel</button>
              <button
                onClick={runImport}
                disabled={!validCount}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50 disabled:pointer-events-none"
              >
                <Upload size={14} strokeWidth={3} /> Import {validCount} {validCount === 1 ? 'company' : 'companies'}
              </button>
            </>
          )}
          {step === 'done' && (
            <>
              <button onClick={onClose} className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface">Close</button>
              <button
                onClick={() => { onClose(); navigate('/companies'); }}
                className="h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong"
              >
                View companies
              </button>
            </>
          )}
          {step === 'intro' && (
            <button onClick={onClose} className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface">Close</button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StepBox({ num, title, desc, action }: { num: number; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl p-4 flex gap-3">
      <div className="w-7 h-7 rounded-full bg-cg-900 text-white text-[12px] font-black grid place-items-center flex-shrink-0">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-extrabold text-text">{title}</div>
        <div className="text-[12px] text-text-3 mt-0.5 leading-snug">{desc}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
