/**
 * Sub-components for AutomatedExecuteView — script list, suite results, result rows.
 */

import { useState } from 'react';
import type { ScriptListItem, ExecuteSuiteResult } from './automation-types';
import type { TestRunResult } from './test-execution-types';

export function PhaseIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 gap-3">
      <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

export interface SingleRunResult {
  result: string;
  duration_ms: number;
  failure_reason?: string;
}

export function ScriptList({
  scripts,
  onRunSingle,
  runningScriptId,
  singleResults,
}: {
  scripts: ScriptListItem[];
  onRunSingle?: (script: ScriptListItem) => void;
  runningScriptId?: string | null;
  singleResults?: Record<string, SingleRunResult>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (scripts.length === 0) return null;

  return (
    <div className="border rounded-lg divide-y">
      {scripts.map((script, idx) => {
        const singleResult = singleResults?.[script.id];
        const isRunning = runningScriptId === script.id;
        const isFailed = singleResult && singleResult.result !== 'passed';
        const testCode = `T${String(idx + 1).padStart(2, '0')}`;
        const isExpanded = expandedId === script.id;
        return (
          <div key={script.id}>
            <div
              className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpandedId(isExpanded ? null : script.id)}
            >
              {isRunning ? (
                <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : (
                <ScriptStatusDot
                  result={singleResult?.result ?? script.last_run_result}
                  stale={script.is_stale}
                />
              )}
              <code className="text-[10px] font-mono text-gray-400 shrink-0">{testCode}</code>
              <span className={`text-xs font-medium text-gray-800 flex-1 ${isExpanded ? '' : 'truncate'}`}>
                {script.test_case_title}
              </span>
              {singleResult && (
                <span className={`text-[10px] font-medium shrink-0 ${
                  singleResult.result === 'passed' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {singleResult.result === 'passed' ? 'Pass' : 'Fail'}
                </span>
              )}
              {singleResult && singleResult.duration_ms > 0 && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  {(singleResult.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
              {(!singleResult || singleResult.duration_ms === 0) && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  {script.tier === 'api' ? 'API' : `${script.step_count} steps`}
                </span>
              )}
              {script.is_stale && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">stale</span>
              )}
              {script.generation_notes?.includes('[GATE:WARN:') && (
                <span
                  className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0"
                  title={script.generation_notes.split('\n').filter(l => l.includes('[GATE:WARN:')).join('; ')}
                >
                  gate warning
                </span>
              )}
              {onRunSingle && !isRunning && !script.is_stale && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRunSingle(script); }}
                  className="px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 shrink-0"
                >
                  Run
                </button>
              )}
            </div>
            {isFailed && singleResult.failure_reason && (
              <div className="px-3 pb-2 pl-7">
                <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 font-mono break-all">
                  {singleResult.failure_reason}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScriptStatusDot({ result, stale }: { result: string | null; stale: boolean }) {
  const color = stale
    ? 'bg-amber-400'
    : result === 'passed'
      ? 'bg-green-500'
      : result === 'failed' || result === 'error'
        ? 'bg-red-500'
        : 'bg-gray-300';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

export function SuiteResultSummary({ result }: { result: ExecuteSuiteResult }) {
  const isPass = result.is_release_ready;
  return (
    <div className={`p-4 rounded-lg border ${
      isPass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {isPass ? (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )}
        <h4 className={`text-sm font-semibold ${isPass ? 'text-green-800' : 'text-red-800'}`}>
          {isPass ? 'All Tests Passed' : 'Some Tests Failed'}
        </h4>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="text-green-700">{result.api_results.passed + result.e2e_results.passed} passed</span>
        {(result.api_results.failed + result.e2e_results.failed) > 0 && <span className="text-red-700">{result.api_results.failed + result.e2e_results.failed} failed</span>}
        {(result.api_results.errors + result.e2e_results.errors) > 0 && <span className="text-red-700">{result.api_results.errors + result.e2e_results.errors} errors</span>}
        {result.e2e_results.skipped_stale > 0 && <span className="text-amber-700">{result.e2e_results.skipped_stale} skipped (stale)</span>}
        <span className="text-gray-500">{(result.total_duration_ms / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}

export function TestCaseResultRow({
  testCode,
  title,
  result,
  duration,
  skippedReason,
}: {
  testCode: string;
  title: string;
  result: TestRunResult | null;
  duration?: number;
  skippedReason?: string;
}) {
  const borderClass = result === 'passed'
    ? 'border-green-200 bg-green-50/30'
    : result === 'failed'
      ? 'border-red-200 bg-red-50/30'
      : 'border-gray-200 bg-gray-50/30';

  const statusIcon = result === 'passed'
    ? <span className="w-2 h-2 rounded-full bg-green-500" />
    : result === 'failed'
      ? <span className="w-2 h-2 rounded-full bg-red-500" />
      : <span className="w-2 h-2 rounded-full bg-gray-300" />;

  const statusLabel = result === 'passed'
    ? 'Passed'
    : result === 'failed'
      ? 'Failed'
      : skippedReason ?? 'Skipped';

  return (
    <div className={`flex items-center gap-2 p-2 border rounded ${borderClass}`}>
      {statusIcon}
      <code className="text-[10px] font-mono text-gray-400">{testCode}</code>
      <span className="text-xs text-gray-800 flex-1 truncate">{title}</span>
      <span className={`text-[10px] font-medium ${
        result === 'passed' ? 'text-green-600' : result === 'failed' ? 'text-red-600' : 'text-gray-500'
      }`}>
        {statusLabel}
      </span>
      {duration !== undefined && (
        <span className="text-[10px] text-gray-400">{(duration / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}
