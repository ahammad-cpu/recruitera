export function Sparkline({ seed, accent }: { seed: number; accent?: boolean }) {
  // deterministic pseudo-random bars per seed so tiles look distinct but stable
  const bars = Array.from({ length: 14 }, (_, i) => {
    const v = Math.abs(Math.sin(seed * 1.7 + i * 1.3) * Math.cos(seed + i * 0.7));
    return 0.25 + v * 0.75;
  });
  return (
    <div className="flex items-end gap-[3px] h-6 mt-2">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${h * 100}%`,
            background: accent ? 'rgb(var(--accent-strong))' : 'rgb(var(--border-2))',
            opacity: 0.6 + h * 0.4,
          }}
        />
      ))}
    </div>
  );
}
