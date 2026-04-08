/**
 * TestCaseExecutionCard - Individual test case card for the test run panel.
 * Shows test info, pass/fail/skip toggles, and optional notes.
 */

import { useState } from 'react';
import { getTestTypeBadge } from '@/components/roadmap/badge-utils';
import { GuidedTestingPanel } from './GuidedTestingPanel';
import type { TestRunResult } from './test-execution-types';
import type { GuidedTestEvidence } from './guided-testing-types';

interface TestCaseForExecution {
  id: string;
  test_code: string;
  title: string;
  test_type: string;
  description: string | null;
  passed: boolean | null;
}

interface TestCaseExecutionCardProps {
  testCase: TestCaseForExecution;
  result: TestRunResult | null;
  notes: string;
  onResultChange: (result: TestRunResult) => void;
  onNotesChange: (notes: string) => void;
  lastRunResult?: TestRunResult | null;
  featureId?: string;
}

const RESULT_BUTTONS: { value: TestRunResult; label: string; activeClass: string; inactiveClass: string }[] = [
  {
    value: 'passed',
    label: 'Pass',
    activeClass: 'bg-green-600 text-white',
    inactiveClass: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
  },
  {
    value: 'failed',
    label: 'Fail',
    activeClass: 'bg-red-600 text-white',
    inactiveClass: 'text-red-600 hover:bg-red-50 border border-red-200',
  },
  {
    value: 'skipped',
    label: 'Skip',
    activeClass: 'bg-gray-600 text-white',
    inactiveClass: 'text-gray-600 hover:bg-gray-100 border border-gray-200',
  },
];

function PreviousStatusIndicator({ passed, lastRunResult }: { passed: boolean | null; lastRunResult?: TestRunResult | null }) {
  // Use last run result if available (distinguishes skipped from not-run)
  if (lastRunResult === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Previously skipped
      </span>
    );
  }
  if (passed === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        Not tested
      </span>
    );
  }
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Previously passed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-red-600">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Previously failed
    </span>
  );
}

export function TestCaseExecutionCard({
  testCase,
  result,
  notes,
  onResultChange,
  onNotesChange,
  lastRunResult,
  featureId,
}: TestCaseExecutionCardProps) {
  const [showNotes, setShowNotes] = useState(notes.length > 0);
  const [showGuided, setShowGuided] = useState(false);

  const handleGuidedComplete = (evidence: GuidedTestEvidence) => {
    const allPassed = evidence.steps.every((s) => s.verdict === 'passed');
    const anyFailed = evidence.steps.some((s) => s.verdict === 'failed');
    onResultChange(anyFailed ? 'failed' : allPassed ? 'passed' : 'skipped');
    setShowGuided(false);
  };

  const borderClass = result === 'passed'
    ? 'border-green-200 bg-green-50/30'
    : result === 'failed'
      ? 'border-red-200 bg-red-50/30'
      : result === 'skipped'
        ? 'border-gray-200 bg-gray-50/30'
        : '';

  return (
    <div className={`border rounded-lg p-3 transition-colors ${borderClass}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Collapsed header when guided testing is active */}
          {showGuided ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <code className="text-xs font-mono text-gray-500">{testCase.test_code}</code>
              {getTestTypeBadge(testCase.test_type)}
              <span className="text-xs text-gray-700 font-medium truncate">{testCase.title}</span>
            </div>
          ) : (
            <>
              {/* Header: test code, type badge, previous status */}
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <code className="text-xs font-mono text-gray-500">{testCase.test_code}</code>
                {getTestTypeBadge(testCase.test_type)}
                <span className="ml-auto">
                  <PreviousStatusIndicator passed={testCase.passed} lastRunResult={lastRunResult} />
                </span>
              </div>

              {/* Title and description */}
              <p className="text-sm font-medium text-gray-900">{testCase.title}</p>
              {testCase.description && (
                <p className="mt-0.5 text-xs text-gray-600">{testCase.description}</p>
              )}

              {/* Result toggle buttons */}
              <div className="flex items-center gap-1.5 mt-2">
                {RESULT_BUTTONS.map((btn) => (
                  <button
                    key={btn.value}
                    onClick={() => onResultChange(btn.value)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      result === btn.value ? btn.activeClass : btn.inactiveClass
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-2 mt-2">
                {featureId && (
                  <button
                    onClick={() => setShowGuided(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI Guide
                  </button>
                )}
                {!showNotes && (
                  <button
                    onClick={() => setShowNotes(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Notes
                  </button>
                )}
              </div>

              {/* Notes textarea */}
              {showNotes && (
                <div className="mt-2">
                  <textarea
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Add notes about this test result..."
                    className="w-full text-xs border rounded px-2 py-1.5 h-16 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                  />
                </div>
              )}
            </>
          )}

          {/* AI Guided Testing Panel */}
          {showGuided && featureId && (
            <div className="mt-2 border-t pt-2">
              <GuidedTestingPanel
                featureId={featureId}
                testCaseId={testCase.id}
                onComplete={handleGuidedComplete}
                onClose={() => setShowGuided(false)}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
