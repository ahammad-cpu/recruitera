export default function StubReport({ title, note }: { title: string; note: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-8 shadow-sh1 text-center">
      <div className="text-[11px] font-bold uppercase tracking-wider text-text-3">{title}</div>
      <div className="mt-2 text-[13px] text-text-2 max-w-md mx-auto">{note}</div>
    </div>
  );
}
