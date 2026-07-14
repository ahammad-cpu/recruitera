import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { StagePill } from '@/components/shared/StagePill';
import { fmtInt, fmtDate, initials } from '@/lib/format';

const TABS: Array<{ key: string; label: string; test: (a: Account) => boolean }> = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'leads', label: 'Leads', test: (a) => ['lead', 'mql'].includes((a.stage || '').toLowerCase()) },
  { key: 'active', label: 'Active pipeline', test: (a) => ['sql', 'demo', 'proposal'].includes((a.stage || '').toLowerCase()) },
  { key: 'paid', label: 'Paid', test: (a) => isPaid(a) },
  { key: 'lost', label: 'Lost', test: (a) => (a.stage || '').toLowerCase() === 'lost' },
];

export default function Companies() {
  const { data, isLoading, error } = useAccounts();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const tabTest = TABS.find((t) => t.key === tab)?.test ?? (() => true);
    const needle = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (!tabTest(a)) return false;
      if (!needle) return true;
      return (
        (a.name || '').toLowerCase().includes(needle) ||
        (a.domain || '').toLowerCase().includes(needle) ||
        (a.am_mail || '').toLowerCase().includes(needle)
      );
    });
  }, [data, tab, q]);

  if (error) {
    return <div className="p-6 text-bad text-[13px]">Error: {String((error as Error).message)}</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text">Companies</h1>
          <p className="text-[12.5px] text-text-3 mt-0.5">
            {isLoading ? 'Loading…' : `${fmtInt(filtered.length)} of ${fmtInt(data?.length ?? 0)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 w-[320px]">
          <Search size={14} className="text-text-3" />
          <input
            placeholder="Search company, domain, owner…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = data?.filter(t.test).length ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'inline-flex items-center gap-2 h-8 px-3 rounded-lg text-[12.5px] font-semibold border ' +
                (active
                  ? 'bg-cg-900 text-white border-cg-900'
                  : 'bg-surface text-text-2 border-border hover:bg-surface-2')
              }
            >
              {t.label}
              <span className={'tnum text-[11px] font-bold px-1.5 py-0.5 rounded-md ' + (active ? 'bg-white/20 text-white' : 'bg-surface-2 text-text-3')}>
                {fmtInt(count)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="overflow-x-auto sc">
          <table className="w-full text-[13px]" style={{ minWidth: 960 }}>
            <thead className="bg-surface-2 text-text-3 text-[11px] uppercase tracking-wider">
              <tr>
                <Th>Company</Th>
                <Th>Stage</Th>
                <Th>Owner</Th>
                <Th>Source</Th>
                <Th>Trial</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="h-4 bg-surface-2 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-3">No companies match.</td>
                </tr>
              )}
              {!isLoading && filtered.slice(0, 200).map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link to={`/companies/${a.id}`} className="flex items-center gap-2.5 group">
                      <div className="w-7 h-7 rounded-lg bg-cg-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {initials(a.name || a.domain)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text truncate flex items-center gap-1.5">
                          {a.name || a.domain || '—'}
                          <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-text-3" />
                        </div>
                        <div className="text-[11px] text-text-3 truncate">{a.domain || '—'}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5"><StagePill stage={a.stage} /></td>
                  <td className="px-4 py-2.5 text-text-2 text-[12px]">{a.am_mail || '—'}</td>
                  <td className="px-4 py-2.5 text-text-2 text-[12px]">{a.source || '—'}</td>
                  <td className="px-4 py-2.5">
                    {a.has_trial ? (
                      <span className="inline-flex h-5 px-2 rounded-full bg-warn-bg text-warn text-[10.5px] font-bold items-center">Trial</span>
                    ) : <span className="text-text-4">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-text-3 text-[12px]">{fmtDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="px-4 py-2.5 text-[11px] text-text-3 bg-surface-2 border-t border-border">
            Showing first 200 rows — pagination lands in Phase 5.
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-bold px-4 py-2.5">{children}</th>;
}
