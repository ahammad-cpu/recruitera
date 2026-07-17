// recruitera-crm-v3/src/features/reports/shared/exportPdf.ts
export function exportReportPdf(tabName: string): void {
  const original = document.title;
  const dateISO = new Date().toISOString().slice(0, 10);
  document.title = `Recruitera Reports — ${tabName} — ${dateISO}`;
  document.body.classList.add('reports-printing');
  const cleanup = () => {
    document.body.classList.remove('reports-printing');
    document.title = original;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
