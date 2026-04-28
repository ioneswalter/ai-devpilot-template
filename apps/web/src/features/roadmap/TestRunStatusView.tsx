/**
 * Status overview view for TestRunPanel — shows test pipeline, test case list, and history.
 */

import { CopyableCommand } from '@/components/ui/CopyableCommand';
import { TestCaseStatusCard } from './TestCaseStatusCard';
import { TestRunHistory } from './TestRunHistory';
import { TestPipelineSteps } from './TestPipelineSteps';
import { CriteriaCoverageBar } from './CriteriaCoverageBar';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult } from './test-execution-types';
import type { CoverageSummary } from './guided-testing-types';
import type { TestExecutionEntry } from './test-execution-types';

interface TestRunStatusViewProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  testCases: TestCase[];
  acceptanceCriteria?: string[];
  coverage: CoverageSummary;
  lastRunResults: Record<string, TestRunResult>;
  history: TestExecutionEntry[];
  isLoading: boolean;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  notRunCount: number;
  allPassed: boolean;
  isDeployed: boolean;
  onRunTests: (prefilled: Record<string, TestRunResult | null>) => void;
  onComplete: () => void;
  onRefresh?: () => void;
  onClose: () => void;
}

export function TestRunStatusView({
  featureId,
  featureCode,
  featureTitle,
  featureStatus,
  testCases,
  acceptanceCriteria,
  coverage,
  lastRunResults,
  history,
  isLoading,
  passedCount,
  failedCount,
  skippedCount,
  notRunCount,
  allPassed,
  isDeployed,
  onRunTests,
  onComplete,
  onRefresh,
  onClose,
}: TestRunStatusViewProps) {
  return (
    // FR-089 v1.1: use flex-1 + min-h-0 (not h-full) so when this view is a sibling
    // of the version banner inside TestRunPanel's flex-col wrapper, it correctly
    // shrinks to fill remaining space and the inner scrollable middle can scroll —
    // otherwise the footer overflows the modal and the user can't reach the Close button.
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <TestPipelineSteps
          featureId={featureId}
          featureCode={featureCode}
          testCaseCount={testCases.length}
          automatedCount={testCases.filter((tc) => tc.automated).length}
          passedCount={passedCount}
          failedCount={failedCount}
          notRunCount={notRunCount}
          onRefresh={onRefresh}
          onRunTests={() => {
            const prefilled: Record<string, TestRunResult | null> = {};
            for (const tc of testCases) {
              if (!tc.id) continue;
              if (lastRunResults[tc.id]) prefilled[tc.id] = lastRunResults[tc.id];
              else if (tc.passed === true) prefilled[tc.id] = 'passed';
              else if (tc.passed === false) prefilled[tc.id] = 'failed';
            }
            onRunTests(prefilled);
          }}
        />
        {testCases.map((tc) => (
          <TestCaseStatusCard
            key={tc.id}
            testCode={tc.test_code}
            title={tc.title}
            passed={tc.passed ?? null}
            isSkipped={tc.id ? lastRunResults[tc.id] === 'skipped' : false}
          />
        ))}
        {acceptanceCriteria && acceptanceCriteria.length > 0 && (
          <CriteriaCoverageBar coverage={coverage} />
        )}
        <TestRunHistory history={history} isLoading={isLoading} />
      </div>
      <div className="border-t p-3 flex items-center justify-between bg-white">
        <span className="text-xs text-gray-400">
          {passedCount} passed, {failedCount} failed
          {skippedCount > 0 ? `, ${skippedCount} skipped` : ''}, {notRunCount} not run
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
          {allPassed && featureStatus !== 'released' && !isDeployed && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              Run <CopyableCommand command={'\\deploy'} className="bg-amber-100" /> before releasing
            </span>
          )}
          {allPassed && featureStatus !== 'released' && isDeployed && (
            <button
              onClick={onComplete}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Release Feature
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
