import AMReport from '@/features/reports/tabs/AMReport';

export default function AMPerformance() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">AM Performance</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          Per-account-manager stats — same source as Reports → AM performance.
        </p>
      </div>
      <AMReport />
    </div>
  );
}
