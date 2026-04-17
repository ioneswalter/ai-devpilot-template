/**
 * AutomatedTestPanelWidgets — Sub-components extracted from AutomatedTestPanel.
 * ScriptRow, GateWarningBadge, TierBadge, StatusBadge, ScriptStepsViewer
 */

import { useState } from 'react';
import { VisualCheckpointViewer } from './VisualCheckpointViewer';
import type { ScriptListItem, GateWarning } from './automation-types';
import type { BrowserScriptResult } from './useAutomatedTests';

interface CheckpointData {
  step_number: number;
  passed: boolean;
  cosmetic_only: boolean;
  explanation: string;
}

export const ACTION_ICONS: Record<string, string> = {
  navigate: '\uD83C\uDF10',
  click: '\uD83D\uDC46',
  type: '\u2328\uFE0F',
  wait: '\u23F3',
  assert_text: '\u2705',
  assert_visible: '\uD83D\uDC41',
  assert_not_visible: '\uD83D\uDEAB',
  screenshot: '\uD83D\uDCF8',
  select: '\uD83D\uDCCB',
  hover: '\uD83D\uDDB1',
};

export function TierBadge({ tier }: { tier?: string }) {
  if (tier === 'api') return <span className="px-1 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded">API</span>;
  if (tier === 'e2e') return <span className="px-1 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-700 rounded">E2E</span>;
  return <span className="px-1 py-0.5 text-[9px] font-bold bg-gray-100 text-gray-500 rounded">MAN</span>;
}

export function StatusBadge({ result, stale }: { result: string | null; stale: boolean }) {
  if (stale) {
    return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Stale" />;
  }
  if (result === 'passed') {
    return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Passed" />;
  }
  if (result === 'failed' || result === 'error') {
    return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Failed" />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" title="Not run" />;
}

export function GateWarningBadge({
  warnings,
  onDismiss,
}: {
  warnings: GateWarning[];
  onDismiss: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const summary = warnings.map((w) => `[${w.type}] ${w.message}`).join('\n');

  return (
    <span className="relative flex-shrink-0">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="w-4 h-4 text-amber-500 hover:text-amber-600"
        title="Gate warning — click to dismiss"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </button>
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 p-2 bg-amber-50 border border-amber-200 rounded shadow-lg text-[10px] text-amber-800 whitespace-pre-wrap">
          <div className="font-semibold mb-1">Gate Warnings ({warnings.length})</div>
          {summary}
          <div className="mt-1 text-amber-500 italic">Click to dismiss</div>
        </div>
      )}
    </span>
  );
}

export function ScriptStepsViewer({
  script,
  stepResults,
}: {
  script: ScriptListItem;
  stepResults?: Array<{ step_number: number; passed: boolean; actual_outcome: string; duration_ms: number }>;
}) {
  const steps = script.script_steps;
  if (!steps || steps.length === 0) {
    return (
      <div className="mt-2 pl-4 border-l-2 border-indigo-100">
        <p className="text-xs text-gray-500 italic">
          Script with {script.step_count} steps (details unavailable).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 pl-4 border-l-2 border-indigo-100 space-y-1">
      {steps.map((step) => {
        const result = stepResults?.find((r) => r.step_number === step.step_number);
        return (
          <div key={step.step_number} className="flex items-start gap-2 text-xs">
            <span className="text-gray-400 font-mono w-4 text-right flex-shrink-0">
              {step.step_number}
            </span>
            {result ? (
              <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
                result.passed ? 'bg-green-500' : 'bg-red-500'
              }`} />
            ) : (
              <span className="flex-shrink-0 w-4 text-center">
                {ACTION_ICONS[step.action] ?? '\u2022'}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-700">{step.action}</span>
              {step.target && (
                <span className="ml-1 text-indigo-600">
                  {step.target.strategy}:{step.target.value}
                </span>
              )}
              {step.value && (
                <span className="ml-1 text-gray-500">"{step.value}"</span>
              )}
              {result && !result.passed && (
                <span className="ml-1 text-red-600 text-[10px]">
                  {result.actual_outcome}
                </span>
              )}
              {!result && step.expected_outcome && (
                <span className="ml-1 text-green-600 text-[10px]">
                  &rarr; {step.expected_outcome}
                </span>
              )}
              {step.checkpoint && (
                <span className="ml-1 text-purple-600 text-[10px] bg-purple-50 px-1 rounded">
                  checkpoint
                </span>
              )}
            </div>
            {result && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {(result.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ScriptRowProps {
  script: ScriptListItem;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  executing: boolean;
  extensionAvailable: boolean;
  checkpoints?: CheckpointData[];
  scriptResult?: BrowserScriptResult;
  gateWarnings: GateWarning[];
  warningDismissed: boolean;
  onDismissWarning: () => void;
}

export function ScriptRow({
  script,
  expanded,
  onToggle,
  onRun,
  onDelete,
  executing,
  extensionAvailable,
  checkpoints,
  scriptResult,
  gateWarnings,
  warningDismissed,
  onDismissWarning,
}: ScriptRowProps) {
  const activeWarnings = gateWarnings.filter((w) => w.level === 'WARN');
  const showWarningBadge = activeWarnings.length > 0 && !warningDismissed;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-2">
          <StatusBadge result={scriptResult?.result ?? script.last_run_result} stale={script.is_stale} />
          <TierBadge tier={script.tier} />
          {showWarningBadge && (
            <GateWarningBadge
              warnings={activeWarnings}
              onDismiss={onDismissWarning}
            />
          )}
          <span className="text-xs font-medium text-gray-800 truncate">
            {script.test_case_title}
          </span>
        </button>
        <span className="text-xs text-gray-400 whitespace-nowrap">{script.step_count} steps</span>
        {scriptResult && (
          <span className={`text-[10px] ${scriptResult.result === 'passed' ? 'text-green-600' : 'text-red-600'}`}>
            {(scriptResult.duration_ms / 1000).toFixed(1)}s
          </span>
        )}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onRun}
            disabled={executing || script.is_stale || !extensionAvailable}
            className="px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
          >
            Run
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded"
          >
            Delete
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          <ScriptStepsViewer script={script} stepResults={scriptResult?.step_results} />
          {checkpoints && checkpoints.length > 0 && (
            <VisualCheckpointViewer checkpoints={checkpoints} />
          )}
        </div>
      )}
    </div>
  );
}
