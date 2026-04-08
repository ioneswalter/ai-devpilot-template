/**
 * AutomatedTestPanel — UI for AI test script generation and execution (FR-109 J1)
 * Shows automation status per test case, generate/run controls, script step viewer.
 * Uses browser extension for real test execution.
 */

import { useState, useEffect } from 'react';
import { useAutomatedTests } from './useAutomatedTests';
import { useExtensionBridge } from './useExtensionBridge';
import { VisualCheckpointViewer } from './VisualCheckpointViewer';
import type { ScriptListItem } from './automation-types';
import type { BrowserSuiteResult, BrowserScriptResult } from './useAutomatedTests';

interface AutomatedTestPanelProps {
  featureId: string;
  testCaseCount: number;
}

interface CheckpointData {
  step_number: number;
  passed: boolean;
  cosmetic_only: boolean;
  explanation: string;
}

export function AutomatedTestPanel({ featureId, testCaseCount }: AutomatedTestPanelProps) {
  const auto = useAutomatedTests(featureId);
  const ext = useExtensionBridge();
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [lastCheckpoints, setLastCheckpoints] = useState<Record<string, CheckpointData[]>>({});
  const [suiteResult, setSuiteResult] = useState<BrowserSuiteResult | null>(null);

  useEffect(() => { auto.loadScripts(); }, [auto.loadScripts]);

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="w-full text-left px-3 py-2 text-xs bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-medium text-indigo-700">
          AI Test Automation
          {auto.scripts.length > 0 && (
            <span className="ml-1 text-indigo-500">
              ({auto.scripts.length}/{testCaseCount} automated)
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden">
      <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-indigo-800">AI Test Automation</h4>
        <div className="flex gap-2">
          <GenerateButton
            generating={auto.generating}
            progress={auto.generatingProgress}
            onGenerate={() => auto.generateScripts()}
          />
          <button
            onClick={() => setShowPanel(false)}
            className="text-xs text-indigo-500 hover:text-indigo-700"
          >
            Collapse
          </button>
        </div>
      </div>

      {auto.error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          {auto.error}
        </div>
      )}

      {!ext.checking && !ext.isAvailable && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          {ext.connectionError?.includes('refresh')
            ? 'Extension reloaded — refresh this page (Cmd+R).'
            : 'Extension not detected — install SpecKit DevTools for real browser testing.'}
          <button
            onClick={() => window.location.reload()}
            className="ml-1 underline font-medium"
          >
            Refresh
          </button>
        </div>
      )}

      {auto.lastGeneration && (
        <GenerationSummary
          generated={auto.lastGeneration.total_generated}
          skipped={auto.lastGeneration.skipped}
        />
      )}

      {/* Running progress */}
      {auto.executing && auto.executingProgress && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100">
          <div className="flex items-center gap-2 text-xs text-indigo-700">
            <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>
              Testing {auto.executingProgress.current}/{auto.executingProgress.total}:
              {' '}{auto.executingProgress.scriptTitle}
            </span>
          </div>
          <div className="mt-1 w-full bg-indigo-200 rounded-full h-1">
            <div
              className="bg-indigo-600 h-1 rounded-full transition-all"
              style={{ width: `${(auto.executingProgress.current / auto.executingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Suite result */}
      {suiteResult && !auto.executing && (
        <div className={`px-3 py-2 border-b text-xs ${
          suiteResult.is_release_ready
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {suiteResult.is_release_ready
            ? `All ${suiteResult.passed} tests passed in ${(suiteResult.duration_ms / 1000).toFixed(1)}s`
            : `${suiteResult.failed} failed, ${suiteResult.passed} passed in ${(suiteResult.duration_ms / 1000).toFixed(1)}s`}
        </div>
      )}

      <div className="divide-y">
        {auto.scripts.length === 0 && !auto.generating && (
          <div className="px-3 py-4 text-center text-xs text-gray-500">
            No automated scripts yet. Click "Generate" to create them from acceptance criteria.
          </div>
        )}
        {auto.scripts.map((script) => {
          const scriptResult = suiteResult?.results.find((r) => r.script_id === script.id);
          return (
            <ScriptRow
              key={script.id}
              script={script}
              expanded={expandedScript === script.id}
              onToggle={() => setExpandedScript(
                expandedScript === script.id ? null : script.id,
              )}
              onRun={async () => {
                if (!ext.isAvailable) return;
                const result = await auto.executeScript(script, 'development', ext.executeTestScript);
                if (result) {
                  // Update suite result to show individual run
                  setSuiteResult((prev) => {
                    if (!prev) {
                      return {
                        feature_id: featureId,
                        total_scripts: 1,
                        passed: result.result === 'passed' ? 1 : 0,
                        failed: result.result === 'failed' ? 1 : 0,
                        errors: result.result === 'error' ? 1 : 0,
                        skipped_stale: 0,
                        duration_ms: result.duration_ms,
                        is_release_ready: result.result === 'passed',
                        results: [result],
                      };
                    }
                    const existingIdx = prev.results.findIndex((r) => r.script_id === script.id);
                    const newResults = [...prev.results];
                    if (existingIdx >= 0) {
                      newResults[existingIdx] = result;
                    } else {
                      newResults.push(result);
                    }
                    const passed = newResults.filter((r) => r.result === 'passed').length;
                    const failed = newResults.filter((r) => r.result === 'failed').length;
                    const errors = newResults.filter((r) => r.result === 'error').length;
                    return {
                      ...prev,
                      passed,
                      failed,
                      errors,
                      is_release_ready: failed === 0 && errors === 0 && passed > 0,
                      results: newResults,
                    };
                  });
                }
              }}
              onDelete={() => auto.deleteScript(script.id)}
              executing={auto.executing}
              extensionAvailable={ext.isAvailable}
              checkpoints={lastCheckpoints[script.id]}
              scriptResult={scriptResult}
            />
          );
        })}
      </div>

      {auto.scripts.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {auto.scripts.filter((s) => !s.is_stale).length} active,{' '}
            {auto.scripts.filter((s) => s.is_stale).length} stale
          </span>
          <button
            onClick={async () => {
              if (!ext.isAvailable) return;
              const result = await auto.executeSuite('development', ext.executeTestScript);
              if (result) setSuiteResult(result);
            }}
            disabled={auto.executing || !ext.isAvailable}
            className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {auto.executing ? 'Running...' : 'Run All'}
          </button>
        </div>
      )}
    </div>
  );
}

function GenerateButton({
  generating,
  progress,
  onGenerate,
}: {
  generating: boolean;
  progress: string | null;
  onGenerate: () => void;
}) {
  return (
    <button
      onClick={onGenerate}
      disabled={generating}
      className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
    >
      {generating ? (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {progress ? `Generating ${progress}...` : 'Generating...'}
        </span>
      ) : 'Generate'}
    </button>
  );
}

function GenerationSummary({
  generated,
  skipped,
}: {
  generated: number;
  skipped: Array<{ test_case_id: string; reason: string }>;
}) {
  const alreadyAutomated = skipped.filter((s) => s.reason === 'Already automated').length;
  const notAutomatable = skipped.length - alreadyAutomated;

  const parts: string[] = [];
  if (alreadyAutomated > 0) parts.push(`${alreadyAutomated} already automated`);
  if (notAutomatable > 0) parts.push(`${notAutomatable} not automatable`);

  return (
    <div className="px-3 py-2 bg-green-50 border-b border-green-100 text-xs text-green-700">
      Generated {generated} new script{generated !== 1 ? 's' : ''}.
      {parts.length > 0 && ` ${parts.join(', ')}.`}
    </div>
  );
}

function ScriptRow({
  script,
  expanded,
  onToggle,
  onRun,
  onDelete,
  executing,
  extensionAvailable,
  checkpoints,
  scriptResult,
}: {
  script: ScriptListItem;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  executing: boolean;
  extensionAvailable: boolean;
  checkpoints?: CheckpointData[];
  scriptResult?: BrowserScriptResult;
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-2">
          <StatusBadge result={scriptResult?.result ?? script.last_run_result} stale={script.is_stale} />
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

function StatusBadge({ result, stale }: { result: string | null; stale: boolean }) {
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

const ACTION_ICONS: Record<string, string> = {
  navigate: '🌐',
  click: '👆',
  type: '⌨️',
  wait: '⏳',
  assert_text: '✅',
  assert_visible: '👁',
  assert_not_visible: '🚫',
  screenshot: '📸',
  select: '📋',
  hover: '🖱',
};

function ScriptStepsViewer({
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
                {ACTION_ICONS[step.action] ?? '•'}
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
                  → {step.expected_outcome}
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
