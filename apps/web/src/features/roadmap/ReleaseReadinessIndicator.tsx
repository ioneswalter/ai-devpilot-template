/**
 * ReleaseReadinessIndicator - Small inline badge showing test readiness for a feature.
 * Green = all passed, Red = failures, Amber = untested, Gray = no tests.
 */

interface ReleaseReadinessIndicatorProps {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
}

export function ReleaseReadinessIndicator({
  total,
  passed,
  failed,
  notRun,
}: ReleaseReadinessIndicatorProps) {
  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
        No tests
      </span>
    );
  }

  if (failed > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        {failed} failed
      </span>
    );
  }

  if (notRun > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
        {notRun} not run
      </span>
    );
  }

  if (passed === total) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
      {passed}/{total}
    </span>
  );
}
