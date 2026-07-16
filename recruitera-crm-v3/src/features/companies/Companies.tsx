import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, Search as SearchIcon, ArrowUpDown, AlertTriangle, Send, UserCheck, X, Ban, RotateCcw } from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useEnum } from '@/hooks/useEnum';
import { useAllContacts } from '@/hooks/useAllContacts';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useProfiles } from '@/hooks/useUsersData';
import { useMe } from '@/hooks/useMe';
import { useChangeOwner, useBulkAssignOwner } from '@/hooks/useAccountMutations';
import { StagePill } from '@/components/shared/StagePill';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { OwnerPickerPopover } from '@/components/shared/OwnerPickerPopover';
import { MergeConfirmation } from './MergeConfirmation';
import { DisqualifyModal } from './DisqualifyModal';
import { BulkEmailModal } from './BulkEmailModal';
import { useRequalifyAccount } from '@/hooks/useDisqualify';
import { ResizeHandle } from '@/components/shared/ResizeHandle';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import { fmtInt, fmtDate, initials } from '@/lib/format';
import { isJunkAccount, buildDupeMap, type DupeEntry } from '@/lib/dedupe';
import { cn } from '@/lib/cn';

type TabKey = 'all' | 'leads' | 'pipeline' | 'collected' | 'trial' | 'expired' | 'churned' | 'won' | 'disqualified';
const TABS: Array<{ key: TabKey; label: string; test: (a: Account) => boolean }> = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'leads', label: 'Leads', test: (a) => (a.stage || '').toLowerCase() === 'lead' },
  { key: 'pipeline', label: 'Pipeline', test: (a) => ['mql', 'sql', 'demo', 'proposal'].includes((a.stage || '').toLowerCase()) },
  { key: 'collected', label: 'Collected', test: (a) => (a.stage || '').toLowerCase() === 'paid' },
  { key: 'trial', label: 'Trial', test: (a) => !!a.has_trial && a.activation_status === 'Active' },
  { key: 'expired', label: 'Expired', test: (a) => !!a.has_trial && a.activation_status === 'Expired' },
  { key: 'churned', label: 'Churned', test: (a) => (a.stage || '').toLowerCase() === 'paid' && a.activation_status === 'Expired' },
  { key: 'won', label: 'Won', test: (a) => (a.stage || '').toLowerCase() === 'won' },
  // Disqualified is only ever set at Lead stage — never a funnel outcome.
  { key: 'disqualified', label: 'Disqualified', test: (a) => !!a.disqualified_reason },
];

type SortKey = 'name' | 'stage' | 'owner' | 'source' | 'created';
type SortDir = 'asc' | 'desc';

const COL_DEFAULTS = {
  company: 340,
  contact: 240,
  stage: 110,
  owner: 240,
  plan: 130,
  source: 150,
  trial: 100,
  created: 120,
  action: 100,
} as const;
type ColKey = keyof typeof COL_DEFAULTS;

export default function Companies() {
  const { data, isLoading, error } = useAccounts();
  const contacts = useAllContacts();
  const cycles = useContractCycles();
  const profiles = useProfiles();
  const me = useMe();
  const stagesEnum = useEnum('pipeline_stage');

  // Plan per account = plan_tier of the latest cycle (by started_at desc).
  // useContractCycles already orders desc, so first hit per account wins.
  const planByAcct = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cycles.data ?? []) {
      if (c.account_id && c.plan_tier && !m.has(c.account_id)) {
        m.set(c.account_id, c.plan_tier);
      }
    }
    return m;
  }, [cycles.data]);
  const changeOwner = useChangeOwner();
  const bulkAssign = useBulkAssignOwner();
  const isAdmin = (me.data?.role || '').toLowerCase() === 'admin';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const profileByEmail = useMemo(() => {
    const m = new Map<string, ReturnType<typeof useProfiles>['data'] extends Array<infer T> | undefined ? T : never>();
    (profiles.data ?? []).forEach((p) => { if (p.email) m.set(p.email, p as never); });
    return m;
  }, [profiles.data]);
  const profileById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof useProfiles>['data'] extends Array<infer T> | undefined ? T : never>();
    (profiles.data ?? []).forEach((p) => m.set(p.id, p as never));
    return m;
  }, [profiles.data]);

  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const [showJunk, setShowJunk] = useState(false);
  const [dupesOnly, setDupesOnly] = useState(false);
  const [stage, setStage] = useState('all');
  const [source, setSource] = useState('all');
  const [owner, setOwner] = useState('all');
  const [trialF, setTrialF] = useState<'all' | 'on' | 'expired'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'created', dir: 'desc' });
  const [mergePair, setMergePair] = useState<{ a: Account; b: Account; reasons: Set<'name' | 'domain' | 'phone' | 'email'> } | null>(null);
  const [disqTarget, setDisqTarget] = useState<Account | null>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const requalify = useRequalifyAccount();
  const { widths, startResize, reset: resetWidths } = useResizableColumns('crm-v3.companies.colWidths.v2', COL_DEFAULTS);
  const totalWidth = (Object.keys(COL_DEFAULTS) as ColKey[]).reduce((s, k) => s + (widths[k] ?? COL_DEFAULTS[k]), 0);

  const contactsMap = contacts.data ?? new Map();
  // Defensive: skip nulls/junk before any downstream .id access.
  const rowsBase = (data ?? []).filter((a): a is Account => !!a && !!a.id && !a.merged_into);

  const dupeMap: Map<string, DupeEntry> = useMemo(
    () => buildDupeMap(rowsBase, contactsMap),
    [rowsBase, contactsMap],
  );

  const sources = useMemo(
    () => Array.from(new Set((rowsBase.map((a) => a.source).filter(Boolean) as string[]))).sort(),
    [rowsBase],
  );
  const owners = useMemo(
    () => Array.from(new Set(rowsBase.map((a) => a.am_mail).filter(Boolean) as string[])).sort(),
    [rowsBase],
  );

  const filtered = useMemo(() => {
    let rows = rowsBase.slice();
    if (!showJunk) rows = rows.filter((a) => !isJunkAccount(a));
    if (dupesOnly) rows = rows.filter((a) => dupeMap.has(a.id));
    const tabTest = TABS.find((t) => t.key === tab)!.test;
    rows = rows.filter(tabTest);
    if (stage !== 'all') rows = rows.filter((a) => (a.stage || '').toLowerCase() === stage);
    if (source !== 'all') rows = rows.filter((a) => a.source === source);
    if (owner !== 'all') rows = rows.filter((a) => a.am_mail === owner);
    if (trialF !== 'all') {
      rows = rows.filter((a) =>
        trialF === 'on' ? (a.has_trial && a.activation_status === 'Active')
        : (a.has_trial && a.activation_status === 'Expired'),
      );
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      const qDigits = needle.replace(/\D+/g, '');
      rows = rows.filter((a) => {
        // Free-text search matches the company itself + its contacts.
        // Owner email is deliberately excluded — a search for "icareer"
        // shouldn't return every account owned by *@icareer.ai. The Owner
        // filter in the toolbar covers that case explicitly.
        if ((a.name || '').toLowerCase().includes(needle)) return true;
        if ((a.domain || '').toLowerCase().includes(needle)) return true;
        const cList = contactsMap.get(a.id) ?? [];
        for (const c of cList) {
          if ((c.full_name || '').toLowerCase().includes(needle)) return true;
          if ((c.email || '').toLowerCase().includes(needle)) return true;
          if (qDigits && c.phone && String(c.phone).replace(/\D+/g, '').includes(qDigits)) return true;
        }
        return false;
      });
    }

    // sort
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const key = sort.key;
      const av = key === 'name' ? (a.name || a.domain || '')
        : key === 'stage' ? (a.stage || '')
        : key === 'owner' ? (a.am_mail || '')
        : key === 'source' ? (a.source || '')
        : a.created_at;
      const bv = key === 'name' ? (b.name || b.domain || '')
        : key === 'stage' ? (b.stage || '')
        : key === 'owner' ? (b.am_mail || '')
        : key === 'source' ? (b.source || '')
        : b.created_at;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [rowsBase, showJunk, dupesOnly, dupeMap, tab, stage, source, owner, trialF, q, contactsMap, sort]);

  const junkCount = (data ?? []).filter(isJunkAccount).length;
  const dupeCount = dupeMap.size;

  if (error) return <div className="p-6 text-bad text-[13px]">Error: {String((error as Error).message)}</div>;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-text">Companies</h1>
          <span className="tnum text-[11px] font-bold text-text-3 bg-surface-2 border border-border px-2 py-0.5 rounded-full">
            {isLoading ? '…' : `${fmtInt(filtered.length)} of ${fmtInt(rowsBase.length)}`}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 w-full">
          <Search size={14} className="text-text-3 flex-shrink-0" />
          <input
            placeholder="Search name, domain, contact, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
          />
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          const n = rowsBase.filter((a) => (!showJunk ? !isJunkAccount(a) : true)).filter(t.test).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[12.5px] font-semibold border transition-colors',
                active ? 'bg-cg-900 text-white border-cg-900' : 'bg-surface text-text-2 border-border hover:bg-surface-2',
              )}
            >
              {t.label}
              <span className={cn('tnum text-[11px] font-bold px-1.5 py-0.5 rounded-md', active ? 'bg-white/20 text-white' : 'bg-surface-2 text-text-3')}>{fmtInt(n)}</span>
            </button>
          );
        })}
      </div>

      {/* FILTER STRIP */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={stage} onChange={setStage} label="Stage">
          <option value="all">All stages</option>
          {(stagesEnum.data ?? []).map((s) => (
            <option key={s} value={s}>{s.toUpperCase()}</option>
          ))}
        </Select>
        <Select value={source} onChange={setSource} label="Source">
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={owner} onChange={setOwner} label="Owner">
          <option value="all">All owners</option>
          {owners.map((o) => {
            const p = (profiles.data ?? []).find((x) => x.email === o);
            return <option key={o} value={o}>{p?.full_name || o}</option>;
          })}
        </Select>
        <Select value={trialF} onChange={(v) => setTrialF(v as typeof trialF)} label="Trial">
          <option value="all">Any trial</option>
          <option value="on">On trial</option>
          <option value="expired">Expired trial</option>
        </Select>

        <div className="flex-1" />

        <Toggle active={dupesOnly} onClick={() => setDupesOnly((v) => !v)} icon={<AlertTriangle size={12} />} accent="warn">
          Duplicates only ({fmtInt(dupeCount)})
        </Toggle>
        <Toggle active={showJunk} onClick={() => setShowJunk((v) => !v)}>
          {showJunk ? 'Hide junk' : `Show junk (${fmtInt(junkCount)})`}
        </Toggle>
        <button
          onClick={resetWidths}
          className="h-8 px-2.5 rounded-lg text-[11.5px] font-bold border border-border bg-surface text-text-3 hover:bg-surface-2"
          title="Reset column widths"
        >
          ⇥ Reset widths
        </button>
      </div>

      {/* TABLE */}
      <div className="rounded-[14px] border border-border overflow-x-auto shadow-[0_1px_2px_rgba(0,20,18,0.04)] bg-surface">
        <div className="overflow-x-auto sc">
          <table className="text-[13px] border-collapse w-auto min-w-full" style={{ width: totalWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {isAdmin && <col style={{ width: 40 }} />}
              {(Object.keys(COL_DEFAULTS) as ColKey[]).map((k) => (
                <col key={k} style={{ width: widths[k] }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 text-text-2 text-[11.5px] uppercase tracking-wider">
              <tr className="border-b border-border">
                {isAdmin && (
                  <th className="w-10 px-2 text-left align-middle">
                    <BulkCheckbox
                      checked={selected.size > 0 && selected.size === filtered.length}
                      indeterminate={selected.size > 0 && selected.size < filtered.length}
                      onChange={(v) => setSelected(v ? new Set(filtered.slice(0, 300).map((a) => a.id)) : new Set())}
                    />
                  </th>
                )}
                <ThSortable onClick={() => toggleSort('name')} active={sort.key === 'name'} dir={sort.dir} onResize={(e) => startResize('company', e)}>Company</ThSortable>
                <Th onResize={(e) => startResize('contact', e)}>Contact</Th>
                <ThSortable onClick={() => toggleSort('stage')} active={sort.key === 'stage'} dir={sort.dir} onResize={(e) => startResize('stage', e)}>Stage</ThSortable>
                <ThSortable onClick={() => toggleSort('owner')} active={sort.key === 'owner'} dir={sort.dir} onResize={(e) => startResize('owner', e)}>Owner</ThSortable>
                <Th onResize={(e) => startResize('plan', e)}>Plan</Th>
                <ThSortable onClick={() => toggleSort('source')} active={sort.key === 'source'} dir={sort.dir} onResize={(e) => startResize('source', e)}>Source</ThSortable>
                <Th onResize={(e) => startResize('trial', e)}>Trial</Th>
                <ThSortable onClick={() => toggleSort('created')} active={sort.key === 'created'} dir={sort.dir} onResize={(e) => startResize('created', e)}>Created</ThSortable>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-border/50"><td className="px-4 py-3" colSpan={isAdmin ? 10 : 9}><div className="h-4 bg-surface-2 rounded animate-pulse" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-4 py-14 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-text-3">
                      <div className="w-11 h-11 rounded-full bg-surface-2 border border-border grid place-items-center text-text-4">
                        <SearchIcon size={18} />
                      </div>
                      <div className="text-[14px] font-black text-text">No matching companies</div>
                      <div className="text-[12px] max-w-md">
                        {q.trim()
                          ? <>No results for <span className="font-bold text-text-2">&ldquo;{q.trim()}&rdquo;</span>. Try a different name, domain, contact, or phone.</>
                          : <>Nothing matches the current filters. Adjust the tabs or filters above.</>}
                      </div>
                      {(q || tab !== 'all' || stage !== 'all' || source !== 'all' || owner !== 'all' || trialF !== 'all' || dupesOnly) && (
                        <button
                          onClick={() => {
                            setQ(''); setTab('all'); setStage('all'); setSource('all');
                            setOwner('all'); setTrialF('all'); setDupesOnly(false);
                          }}
                          className="mt-1 text-[12px] font-bold text-accent-ink hover:underline"
                        >
                          Clear search &amp; filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && filtered.slice(0, 300).map((a, idx) => {
                const dupe = dupeMap.get(a.id);
                const primary = (contactsMap.get(a.id) ?? [])[0];
                return (
                  <tr key={a.id} className={cn(
                    'border-b border-border/50 hover:bg-accent-soft/40 transition-colors',
                    idx % 2 === 1 && 'bg-surface-2/40',
                    selected.has(a.id) && 'bg-accent-soft/60',
                  )}>
                    {isAdmin && (
                      <td className="px-2 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                        <BulkCheckbox
                          checked={selected.has(a.id)}
                          onChange={(v) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(a.id); else next.delete(a.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 overflow-hidden border-r border-border/40">
                      <Link to={`/companies/${a.id}`} className="flex items-center gap-2.5 group min-w-0" title={a.name || a.domain || ''}>
                        <div className="w-7 h-7 rounded-lg bg-cg-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {initials(a.name || a.domain)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-text truncate min-w-0">{a.name || a.domain || '—'}</span>
                            {dupe && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const partnerId = Array.from(dupe.partners)[0];
                                  const partner = rowsBase.find((r) => r.id === partnerId);
                                  if (partner) setMergePair({ a, b: partner, reasons: dupe.reasons });
                                }}
                                className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full bg-bad-bg text-bad text-[10px] font-bold border border-bad/20 flex-shrink-0 hover:bg-bad/10"
                                title={`Duplicate — shares ${Array.from(dupe.reasons).join(', ')} with ${dupe.partners.size} other row(s). Click to review & merge.`}
                              >
                                dupe ×{dupe.partners.size + 1}
                              </button>
                            )}
                            {isJunkAccount(a) && (
                              <span className="inline-flex h-[18px] items-center px-1.5 rounded-full bg-surface-2 text-text-3 text-[10px] font-bold border border-border flex-shrink-0">junk</span>
                            )}
                            <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-text-3 flex-shrink-0" />
                          </div>
                          <div className="text-[11px] text-text-3 truncate">{a.domain || '—'}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 border-r border-border/40">
                      {primary ? (
                        <div className="min-w-0">
                          <div className="text-[12px] text-text truncate max-w-[220px]">{primary.email || primary.full_name || '—'}</div>
                          {primary.phone && <div className="text-[11px] text-text-3 truncate">{primary.phone}</div>}
                        </div>
                      ) : <span className="text-text-4 text-[12px]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 border-r border-border/40"><StagePill stage={a.stage} /></td>
                    <td className="px-4 py-2.5 border-r border-border/40">
                      <OwnerCell
                        account={a}
                        profileByEmail={profileByEmail as never}
                        profileById={profileById as never}
                        profiles={profiles.data ?? []}
                        editable={isAdmin}
                        onChange={(prof) => changeOwner.mutate({
                          id: a.id,
                          owner_id: prof?.id ?? null,
                          am_mail: prof?.email ?? null,
                        })}
                      />
                    </td>
                    <td className="px-4 py-2.5 border-r border-border/40">
                      {planByAcct.get(a.id)
                        ? <span className="inline-flex items-center h-5 px-2 rounded-full bg-accent-soft text-accent-ink text-[10.5px] font-bold uppercase tracking-wider">{planByAcct.get(a.id)}</span>
                        : <span className="text-text-4 text-[12px]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-text-2 text-[12px] border-r border-border/40">{a.source || '—'}</td>
                    <td className="px-4 py-2.5 border-r border-border/40">
                      {a.has_trial ? (
                        <span className={cn(
                          'inline-flex h-5 px-2 rounded-full text-[10.5px] font-bold items-center',
                          a.activation_status === 'Active' ? 'bg-warn-bg text-warn' :
                          a.activation_status === 'Expired' ? 'bg-bad-bg text-bad' :
                          'bg-surface-2 text-text-3',
                        )}>
                          {a.activation_status === 'Expired' ? 'Expired' : 'Trial'}
                        </span>
                      ) : (isPaid(a) ? (
                        <span className="inline-flex h-5 px-2 rounded-full bg-ok-bg text-ok text-[10.5px] font-bold items-center">Paid</span>
                      ) : <span className="text-text-4">—</span>)}
                    </td>
                    <td className="px-4 py-2.5 text-text-3 text-[12px] whitespace-nowrap border-r border-border/40">{fmtDate(a.created_at)}</td>
                    <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {a.stage === 'lost' || a.disqualified_reason
                        ? (
                          <button
                            onClick={() => requalify.mutate({ id: a.id, stage: 'lead' })}
                            title={a.disqualified_reason ? `Disqualified: ${a.disqualified_reason}${a.disqualified_notes ? ' — ' + a.disqualified_notes : ''}. Click to requalify.` : 'Requalify'}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-text-3 text-[11px] font-bold hover:bg-surface-2"
                          >
                            <RotateCcw size={11} /> Requalify
                          </button>
                        )
                        : (
                          <button
                            onClick={() => setDisqTarget(a)}
                            title="Disqualify"
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-bad/30 bg-bad-bg text-bad text-[11px] font-bold hover:bg-bad/10"
                          >
                            <Ban size={11} /> Disqualify
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 300 && (
          <div className="px-4 py-2.5 text-[11px] text-text-3 bg-surface-2 border-t border-border">
            Showing first 300 of {fmtInt(filtered.length)} — refine filters or search.
          </div>
        )}
      </div>

      {mergePair && (
        <MergeConfirmation
          accountA={mergePair.a}
          accountB={mergePair.b}
          reasons={mergePair.reasons}
          contactsByAcct={contactsMap}
          onClose={() => setMergePair(null)}
        />
      )}

      {disqTarget && <DisqualifyModal account={disqTarget} onClose={() => setDisqTarget(null)} />}
      {bulkEmailOpen && (
        <BulkEmailModal
          accounts={filtered.filter((a) => selected.has(a.id))}
          contactsByAcct={contactsMap}
          onClose={() => setBulkEmailOpen(false)}
        />
      )}

      {isAdmin && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-cg-900 text-white rounded-2xl shadow-sh3 px-3 py-2 flex items-center gap-3 border border-cg-800">
          <span className="text-[13px] font-bold pl-2">{selected.size} account{selected.size === 1 ? '' : 's'} selected</span>
          <span className="w-px h-6 bg-white/20" />
          <button
            onClick={() => setBulkEmailOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-info text-white text-[12.5px] font-bold hover:opacity-90"
          >
            <Send size={13} /> Send bulk email
          </button>
          <div className="relative">
            <button
              onClick={() => setBulkPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white/10 text-white text-[12.5px] font-bold hover:bg-white/20"
            >
              <UserCheck size={13} /> Assign owner
            </button>
            {bulkPickerOpen && (
              <OwnerPickerPopover
                profiles={profiles.data ?? []}
                currentId={null}
                placement="top"
                align="right"
                onSelect={(prof) => {
                  bulkAssign.mutate({ ids: Array.from(selected), owner_id: prof?.id ?? null, am_mail: prof?.email ?? null });
                  setSelected(new Set());
                }}
                onClose={() => setBulkPickerOpen(false)}
              />
            )}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
            title="Clear selection"
          ><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function BulkCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate; }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label ?? (indeterminate ? 'Some selected' : checked ? 'Deselect all' : 'Select all')}
      title={label ?? (checked ? 'Deselect all' : 'Select all')}
      className="w-[18px] h-[18px] rounded-[5px] accent-accent-strong cursor-pointer"
    />
  );
}

function Th({ children, onResize }: { children: React.ReactNode; onResize?: (e: React.MouseEvent) => void }) {
  return (
    <th className="relative text-left font-bold px-4 py-2.5 truncate border-r border-border/40 last:border-r-0">
      {children}
      {onResize && <ResizeHandle onMouseDown={onResize} />}
    </th>
  );
}
function ThSortable({
  onClick, active, dir, children, onResize,
}: {
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  children: React.ReactNode;
  onResize?: (e: React.MouseEvent) => void;
}) {
  return (
    <th className="relative text-left font-bold px-4 py-2.5 border-r border-border/40 last:border-r-0">
      <button onClick={onClick} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-text max-w-full">
        <span className="truncate">{children}</span>
        <ArrowUpDown size={11} className={active ? 'text-text' : 'text-text-4'} />
        {active && <span className="text-[9px] text-text-3">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
      {onResize && <ResizeHandle onMouseDown={onResize} />}
    </th>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-2.5 pr-7 border border-border rounded-lg bg-surface text-[12px] font-semibold text-text-2 outline-none cursor-pointer"
        title={label}
      >
        {children}
      </select>
    </label>
  );
}

function OwnerCell({
  account, profileByEmail, profileById, profiles, editable, onChange,
}: {
  account: Account;
  profileByEmail: Map<string, import('@/hooks/useUsersData').Profile>;
  profileById: Map<string, import('@/hooks/useUsersData').Profile>;
  profiles: import('@/hooks/useUsersData').Profile[];
  editable: boolean;
  onChange: (profile: import('@/hooks/useUsersData').Profile | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = (account.owner_id && profileById.get(account.owner_id))
    || (account.am_mail && profileByEmail.get(account.am_mail))
    || null;
  const label = current?.full_name || account.am_mail || 'Unassigned';

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => editable && setOpen((v) => !v)}
        disabled={!editable}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={editable ? 'Click to change owner' : label}
        className={cn(
          'flex items-center gap-2 min-w-0 text-left rounded-md p-1 -m-1',
          editable && 'hover:bg-surface-2 cursor-pointer',
        )}
      >
        <OwnerAvatar profile={current} size={30} fallback={account.am_mail} />
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-text truncate">{label}</div>
          {current?.email && <div className="text-[10.5px] text-text-3 truncate">{current.email}</div>}
        </div>
      </button>
      {open && (
        <OwnerPickerPopover
          profiles={profiles}
          currentId={current?.id ?? null}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Toggle({ active, onClick, icon, accent, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; accent?: 'warn'; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11.5px] font-bold border',
        active
          ? accent === 'warn' ? 'bg-warn-bg text-warn border-warn/30' : 'bg-cg-900 text-white border-cg-900'
          : 'bg-surface text-text-2 border-border hover:bg-surface-2',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
