/**
 * Manual fallback test execution view for TestRunPanel.
 */

import { TestCaseExecutionCard } from './TestCaseExecutionCard';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult } from './test-execution-types';

interface TestRunManualViewProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  testCases: TestCase[];
  environment: string;
  onEnvironmentChange: (env: string) => void;
  results: Record<string, TestRunResult | null>;
  onResultChange: (tcId: string, result: TestRunResult) => void;
  notes: Record<string, string>;
  onNotesChange: (tcId: string, notes: string) => void;
  lastRunResults: Record<string, TestRunResult>;
  submitError: Error | null;
  isSubmitting: boolean;
  markedCount: number;
  onSubmit: () => void;
  onSwitchToAutomated: () => void;
  onBackToOverview: () => void;
  onClose: () => void;
}

export function TestRunManualView({
  featureId, featureCode, featureTitle, testCases,
  environment, onEnvironmentChange, results, onResultChange,
  notes, onNotesChange, lastRunResults, submitError, isSubmitting,
  markedCount, onSubmit, onSwitchToAutomated, onBackToOverview, onClose,
}: TestRunManualViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">Mark each test case as Pass, Fail, or Skip</p>
      </div>
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">Environment:</label>
        <select value={environment} onChange={(e) => onEnvironmentChange(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </div>
      {submitError && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-red-700">{submitError.message}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Manual Results ({markedCount}/{testCases.length})
        </h4>
        {testCases.map((tc) => (
          <TestCaseExecutionCard
            key={tc.id}
            testCase={{ ...tc, id: tc.id!, description: tc.description ?? null, passed: tc.passed ?? null }}
            result={results[tc.id!] ?? null}
            notes={notes[tc.id!] ?? ''}
            onResultChange={(r) => onResultChange(tc.id!, r)}
            onNotesChange={(n) => onNotesChange(tc.id!, n)}
            lastRunResult={tc.id ? lastRunResults[tc.id] ?? null : null}
            featureId={featureId}
          />
        ))}
      </div>
      <div className="border-t p-3 flex items-center justify-between bg-white">
        <div className="flex gap-2">
          <button onClick={onSwitchToAutomated} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            Switch to Automated
          </button>
          <button onClick={onBackToOverview} className="text-xs text-gray-500 hover:text-gray-700">
            Back to Overview
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
          {markedCount > 0 && (
            <button onClick={onSubmit} disabled={isSubmitting}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
              {isSubmitting ? 'Submitting...' : `Submit ${markedCount} Result${markedCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
