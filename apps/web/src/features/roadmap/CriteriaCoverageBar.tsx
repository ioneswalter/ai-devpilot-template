/**
 * CriteriaCoverageBar - Compact bar showing acceptance criteria coverage.
 * Expandable to show per-criterion details with "Suggest Test" for uncovered ones.
 */

import { useState } from 'react';
import type { CoverageSummary, CriterionCoverage } from './guided-testing-types';

interface CriteriaCoverageBarProps {
  coverage: CoverageSummary;
  onSuggestTest?: (criterionText: string) => void;
  suggestingFor?: string | null;
}

function StatusIcon({ status }: { status: CriterionCoverage['status'] }) {
  if (status === 'passed') {
    return <span className="text-green-600 font-bold text-xs">&#10003;</span>;
  }
  if (status === 'failed') {
    return <span className="text-red-600 font-bold text-xs">&#10007;</span>;
  }
  return <span className="text-gray-400 text-xs">&#9675;</span>;
}

function CoverageSegments({ coverage }: { coverage: CoverageSummary }) {
  if (coverage.total === 0) return null;

  const passedPct = (coverage.passed / coverage.total) * 100;
  const failedPct = (coverage.failed / coverage.total) * 100;
  const untestedPct = (coverage.untested / coverage.total) * 100;

  return (
    <div className="w-full bg-gray-200 rounded-full h-2 flex overflow-hidden">
      {passedPct > 0 && (
        <div className="bg-green-500 h-2" style={{ width: `${passedPct}%` }} />
      )}
      {failedPct > 0 && (
        <div className="bg-red-500 h-2" style={{ width: `${failedPct}%` }} />
      )}
      {untestedPct > 0 && (
        <div className="bg-gray-300 h-2" style={{ width: `${untestedPct}%` }} />
      )}
    </div>
  );
}

export function CriteriaCoverageBar({
  coverage,
  onSuggestTest,
  suggestingFor,
}: CriteriaCoverageBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (coverage.total === 0) return null;

  return (
    <div className="border rounded-lg">
      {/* Compact bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg"
      >
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-medium text-gray-700">Criteria Coverage</span>
          <div className="flex-1 max-w-32">
            <CoverageSegments coverage={coverage} />
          </div>
          <span className="text-xs text-gray-500">
            {coverage.passed}/{coverage.total} verified ({coverage.percentage}%)
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded criteria list */}
      {expanded && (
        <div className="px-3 pb-3 border-t space-y-1.5 mt-1">
          {coverage.criteria.map((criterion) => (
            <div key={criterion.index} className="flex items-start gap-2 py-1">
              <StatusIcon status={criterion.status} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-700">{criterion.text}</p>
                {criterion.test_case_code && (
                  <code className="text-[10px] font-mono text-gray-400">{criterion.test_case_code}</code>
                )}
                {criterion.evidence_date && (
                  <span className="text-[10px] text-gray-400 ml-1">
                    {new Date(criterion.evidence_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              {criterion.status === 'untested' && onSuggestTest && (
                <button
                  onClick={() => onSuggestTest(criterion.text)}
                  disabled={suggestingFor === criterion.text}
                  className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap disabled:opacity-50"
                >
                  {suggestingFor === criterion.text ? 'Suggesting...' : 'Suggest Test'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
