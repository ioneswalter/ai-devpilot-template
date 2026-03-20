/**
 * TestCaseExecutionCard - Individual test case card for the test run panel.
 * Shows test info, pass/fail/skip toggles, and optional notes.
 */

import { useState } from 'react';
import { getTestTypeBadge } from '@/components/roadmap/badge-utils';
import type { TestRunResult } from './test-execution-types';

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
}: TestCaseExecutionCardProps) {
  const [showNotes, setShowNotes] = useState(notes.length > 0);

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

            {/* Notes toggle */}
            {!showNotes && (
              <button
                onClick={() => setShowNotes(true)}
                className="ml-auto text-xs text-blue-600 hover:text-blue-700"
              >
                Add notes
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
        </div>
      </div>
    </div>
  );
}
