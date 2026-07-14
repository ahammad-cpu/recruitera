import type { ReactNode } from 'react';

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      {icon && <div className="mx-auto mb-3 text-text-4">{icon}</div>}
      <div className="text-[13px] font-bold text-text">{title}</div>
      {hint && <div className="text-[12px] text-text-3 mt-1">{hint}</div>}
    </div>
  );
}
