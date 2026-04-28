/**
 * Done phase view for AutomatedExecuteView — shows results by test case.
 */

import { PhaseIndicator, TestCaseResultRow } from './AutomatedExecuteWidgets';
import { BrowserSuiteResultSummary, FailureDetail } from './AutomatedExecuteSubViews';
import { ImprovementPanel } from './ImprovementPanel';
import { FailureGuidancePanel } from './FailureGuidancePanel';
import type { BrowserSuiteResult } from './useAutomatedTests';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult } from './test-execution-types';
import type { ImprovementRecommendation } from './automation-types';

interface AutomatedExecuteDoneViewProps {
  featureId: string;
  featureCode: string;
  suiteResult: BrowserSuiteResult;
  testCases: TestCase[];
  results: Record<string, TestRunResult | null>;
  markedCount: number;
  loadingRecs: boolean;
  recommendations: ImprovementRecommendation[];
  onUpdateRecommendation: (
    id: string,
    status: 'accepted' | 'dismissed' | 'deferred'
  ) => Promise<void>;
}

export function AutomatedExecuteDoneView({
  featureId,
  featureCode,
  suiteResult,
  testCases,
  results,
  markedCount,
  loadingRecs,
  recommendations,
  onUpdateRecommendation,
}: AutomatedExecuteDoneViewProps) {
  return (
    <>
      <BrowserSuiteResultSummary result={suiteResult} />
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4">
        Results by Test Case ({markedCount}/{testCases.length})
      </h4>
      <div className="space-y-2">
        {testCases.map((tc) => {
          const tcResult = results[tc.id!];
          const scriptResult = suiteResult.results.find((r) => r.test_case_id === tc.id);
          return (
            <TestCaseResultRow
              key={tc.id}
              testCode={tc.test_code}
              title={tc.title}
              result={tcResult ?? null}
              duration={scriptResult?.duration_ms}
              skippedReason={!scriptResult ? 'No script' : undefined}
            />
          );
        })}
      </div>

      {/* Failed step details */}
      {suiteResult.results.some((r) => r.failures.length > 0) && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
            Failure Details
          </h4>
          <div className="space-y-2">
            {suiteResult.results
              .filter((r) => r.failures.length > 0)
              .map((r) => (
                <FailureDetail key={r.script_id} scriptResult={r} />
              ))}
          </div>
        </div>
      )}

      {/* Failure Guidance (FR-137) — only when there are failures */}
      {suiteResult.results.some((r) => r.failures.length > 0) && (
        <div className="mt-4">
          <FailureGuidancePanel featureId={featureId} featureCode={featureCode} />
        </div>
      )}

      {/* Improvement Recommendations */}
      {loadingRecs && (
        <div className="mt-4">
          <PhaseIndicator label="Loading improvement recommendations..." />
        </div>
      )}
      {!loadingRecs && recommendations.length > 0 && (
        <div className="mt-4">
          <ImprovementPanel
            recommendations={recommendations}
            onUpdateStatus={onUpdateRecommendation}
          />
        </div>
      )}
    </>
  );
}
