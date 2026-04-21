/**
 * AutomatedTestPanel — UI for AI test script generation and execution (FR-109 J1)
 * Shows automation status per test case, generate/run controls, script step viewer.
 * Uses browser extension for real test execution.
 */

import { useState, useEffect, useCallback } from 'react';
import { CopyableCommand } from '@/components/ui/CopyableCommand';
import { useAutomatedTests } from './useAutomatedTests';
import { useExtensionBridge } from './useExtensionBridge';
import { parseGateWarnings, dismissGateWarning, isWarningDismissed } from './gate-warning-utils';
import { ScriptRow } from './AutomatedTestPanelWidgets';
import type { BrowserSuiteResult } from './useAutomatedTests';

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
  const [lastCheckpoints] = useState<Record<string, CheckpointData[]>>({});
  const [suiteResult, setSuiteResult] = useState<BrowserSuiteResult | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  useEffect(() => { auto.loadScripts(); }, [auto.loadScripts]);

  // Initialize dismissed state from sessionStorage
  useEffect(() => {
    const dismissed = new Set<string>();
    for (const script of auto.scripts) {
      if (isWarningDismissed(featureId, script.id)) {
        dismissed.add(script.id);
      }
    }
    setDismissedWarnings(dismissed);
  }, [auto.scripts, featureId]);

  const handleDismissWarning = useCallback((scriptId: string) => {
    dismissGateWarning(featureId, scriptId);
    setDismissedWarnings((prev) => new Set([...prev, scriptId]));
  }, [featureId]);

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
            No automated scripts yet. Run <CopyableCommand command="\\generate-tests FR-XXX" className="bg-gray-100" /> in Claude Code to create them from actual source code.
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
              gateWarnings={parseGateWarnings(script.generation_notes ?? null)}
              warningDismissed={dismissedWarnings.has(script.id)}
              onDismissWarning={() => handleDismissWarning(script.id)}
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

