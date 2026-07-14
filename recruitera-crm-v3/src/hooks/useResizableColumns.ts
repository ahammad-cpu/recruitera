import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Resizable-column state, persisted to localStorage.
 * Each key is a stable column id. Widths are in px.
 *
 * Consumer wires the returned {widths, startResize} into <colgroup><col style="width:...">
 * and a drag handle inside each <th>.
 */
export function useResizableColumns(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaults;
  });

  // Persist on every change (debounced by React's batch)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [storageKey, widths]);

  const active = useRef<{ id: string; startX: number; startW: number } | null>(null);

  const startResize = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    active.current = { id, startX: e.clientX, startW: widths[id] ?? defaults[id] ?? 120 };

    const onMove = (ev: MouseEvent) => {
      if (!active.current) return;
      const dx = ev.clientX - active.current.startX;
      const next = Math.max(90, active.current.startW + dx);
      setWidths((w) => ({ ...w, [active.current!.id]: next }));
    };
    const onUp = () => {
      active.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [widths, defaults]);

  const reset = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, startResize, reset };
}
