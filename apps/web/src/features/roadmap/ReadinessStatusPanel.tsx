/**
 * ReadinessStatusPanel - Displays per-step readiness results (FR-116)
 * Shows seed data, test cases, and status update outcomes with success/failure indicators.
 */

import type { ReadinessResults } from '@/lib/api/admin-api';

interface ReadinessStatusPanelProps {
  readinessResults: ReadinessResults;
  onRerunReadiness: () => void;
  isRerunning: boolean;
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  success: { icon: '\u2713', color: 'text-green-600' },
  failed: { icon: '\u2717', color: 'text-red-600' },
  skipped: { icon: '\u2014', color: 'text-gray-400' },
};

function StepBadge({ status }: { status: string }) {
  const cfg = STATUS_ICONS[status] ?? STATUS_ICONS.skipped;
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${cfg.color} ${
      status === 'success' ? 'bg-green-50' : status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
    }`}>
      {cfg.icon}
    </span>
  );
}

const EMPTY_STEP = { status: 'skipped' as const, duration_ms: 0, errors: [], records: 0, created: 0, skipped: 0 };
const EMPTY_STATUS = { status: 'skipped' as const, from: '', to: '' };

export function ReadinessStatusPanel({ readinessResults, onRerunReadiness, isRerunning }: ReadinessStatusPanelProps) {
  const seed_data = readinessResults.seed_data ?? EMPTY_STEP;
  const test_cases = readinessResults.test_cases ?? EMPTY_STEP;
  const status_update = readinessResults.status_update ?? EMPTY_STATUS;
  const overall_status = readinessResults.overall_status ?? 'failed';

  const overallColor = overall_status === 'success' ? 'border-green-200 bg-green-50'
    : overall_status === 'partial' ? 'border-amber-200 bg-amber-50'
    : 'border-red-200 bg-red-50';

  const overallText = overall_status === 'success' ? 'text-green-800'
    : overall_status === 'partial' ? 'text-amber-800'
    : 'text-red-800';

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${overallColor}`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${overallText}`}>
          Test Readiness {overall_status === 'success' ? 'Complete' : overall_status === 'partial' ? 'Partial' : 'Failed'}
        </h4>
        {overall_status !== 'success' && (
          <button
            onClick={onRerunReadiness}
            disabled={isRerunning}
            className="px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 disabled:opacity-50"
          >
            {isRerunning ? 'Re-running...' : 'Re-run Readiness'}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {/* Seed Data */}
        <div className="flex items-center gap-2 text-xs">
          <StepBadge status={seed_data.status} />
          <span className="text-gray-700 font-medium">Seed Data</span>
          {seed_data.records > 0 && (
            <span className="text-gray-500">{seed_data.records} records inserted</span>
          )}
          {seed_data.status === 'skipped' && (
            <span className="text-gray-400">skipped</span>
          )}
        </div>

        {/* Test Cases */}
        <div className="flex items-center gap-2 text-xs">
          <StepBadge status={test_cases.status} />
          <span className="text-gray-700 font-medium">Test Cases</span>
          {test_cases.created > 0 && (
            <span className="text-gray-500">{test_cases.created} created</span>
          )}
          {test_cases.skipped > 0 && (
            <span className="text-gray-400">({test_cases.skipped} existing)</span>
          )}
        </div>

        {/* Status Update */}
        <div className="flex items-center gap-2 text-xs">
          <StepBadge status={status_update.status} />
          <span className="text-gray-700 font-medium">Status Update</span>
          {status_update.status === 'success' && status_update.from !== status_update.to && (
            <span className="text-gray-500">{status_update.from} &rarr; {status_update.to}</span>
          )}
        </div>
      </div>

      {/* Show errors if any step failed */}
      {((seed_data.errors?.length ?? 0) > 0 || (test_cases.errors?.length ?? 0) > 0) && (
        <div className="mt-2 text-xs text-red-600 space-y-0.5">
          {(seed_data.errors ?? []).slice(0, 2).map((e, i) => (
            <p key={`seed-${i}`} className="truncate">Seed: {e}</p>
          ))}
          {(test_cases.errors ?? []).slice(0, 2).map((e, i) => (
            <p key={`tc-${i}`} className="truncate">Test case: {e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
