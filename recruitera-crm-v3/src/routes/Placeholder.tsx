export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <div className="max-w-2xl bg-surface border border-border rounded-2xl p-8 shadow-sh1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-3">Coming next</div>
        <h1 className="text-xl font-bold text-text mt-1">{title}</h1>
        <p className="text-[13px] text-text-2 mt-3 leading-relaxed">
          This screen is scaffolded. It will be ported from <code className="bg-surface-2 px-1.5 py-0.5 rounded">crm-v2.html</code> in
          Phase&nbsp;2 (read-only surfaces) and wired to live Supabase data via TanStack Query.
        </p>
      </div>
    </div>
  );
}
