/**
 * AutomatedExecuteView — Real browser-based test execution via extension.
 * Opens actual browser tabs, clicks elements, and validates assertions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAutomatedTests } from './useAutomatedTests';
import { useExtensionBridge } from './useExtensionBridge';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import { PreflightReport } from './PreflightReport';
import { PhaseIndicator, ScriptList } from './AutomatedExecuteWidgets';
import { RunningProgress } from './AutomatedExecuteSubViews';
import { AutomatedExecuteHeader } from './AutomatedExecuteHeader';
import { AutomatedExecuteFooter } from './AutomatedExecuteFooter';
import { AutomatedExecuteDoneView } from './AutomatedExecuteDoneView';
import type { SingleRunResult } from './AutomatedExecuteWidgets';
import type { ScriptListItem, ImprovementRecommendation } from './automation-types';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult } from './test-execution-types';
import type { BrowserSuiteResult } from './useAutomatedTests';

interface AutomatedExecuteViewProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  testCases: TestCase[];
  environment: string;
  onEnvironmentChange: (env: string) => void;
  onResultsReady: (results: Record<string, TestRunResult>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: Error | null;
  results: Record<string, TestRunResult | null>;
  onBack: () => void;
  onClose: () => void;
  onSwitchToManual: () => void;
}

type Phase = 'loading' | 'ready' | 'preflight' | 'preflight-failed' | 'running' | 'done' | 'error';

export function AutomatedExecuteView({
  featureId, featureCode, featureTitle, testCases,
  environment, onEnvironmentChange, onResultsReady, onSubmit,
  isSubmitting, submitError, results, onBack, onClose, onSwitchToManual,
}: AutomatedExecuteViewProps) {
  const auto = useAutomatedTests(featureId);
  const ext = useExtensionBridge();
  const [phase, setPhase] = useState<Phase>('loading');
  const [suiteResult, setSuiteResult] = useState<BrowserSuiteResult | null>(null);
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);
  const [singleResults, setSingleResults] = useState<Record<string, SingleRunResult>>({});
  const [recommendations, setRecommendations] = useState<ImprovementRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => { auto.loadScripts(); }, [auto.loadScripts]);

  useEffect(() => {
    if (phase !== 'loading' || !auto.scriptsLoaded) return;
    const seeded: Record<string, SingleRunResult> = {};
    for (const script of auto.scripts) {
      if (script.last_run_result) {
        seeded[script.id] = { result: script.last_run_result, duration_ms: 0, failure_reason: undefined };
      }
    }
    if (Object.keys(seeded).length > 0) setSingleResults(seeded);
    setPhase('ready');
  }, [phase, auto.scriptsLoaded, auto.scripts.length]);

  const mapSuiteToResults = useCallback((suite: BrowserSuiteResult) => {
    const mapped: Record<string, TestRunResult> = {};
    for (const r of suite.results) {
      if (r.result === 'passed') mapped[r.test_case_id] = 'passed';
      else if (r.result === 'failed' || r.result === 'error') mapped[r.test_case_id] = 'failed';
      else mapped[r.test_case_id] = 'skipped';
    }
    return mapped;
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    try {
      const { recommendations: recs } = await testAutomationApi.getRecommendations(featureId);
      setRecommendations(recs);
    } catch { /* Best-effort */ }
    setLoadingRecs(false);
  }, [featureId]);

  const handleUpdateRecommendation = useCallback(async (id: string, status: 'accepted' | 'dismissed' | 'deferred') => {
    try {
      await testAutomationApi.updateRecommendation(id, status);
      setRecommendations((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    } catch { /* Best-effort */ }
  }, []);

  const triggerImprovementAnalysis = useCallback(async (sr: BrowserSuiteResult) => {
    setLoadingRecs(true);
    try {
      const apiTimings = sr.results.filter((r) => r.steps_total === 1 && r.result === 'passed')
        .map((r) => ({ test_case_id: r.test_case_id, endpoint: r.test_case_title, duration_ms: r.duration_ms }));
      const e2eTimings = sr.results.filter((r) => r.steps_total > 1)
        .map((r) => ({ test_case_id: r.test_case_id, step_timings: (r.step_results || []).map((s) => ({ step: s.step_number, duration_ms: s.duration_ms })) }));
      const testedIds = new Set(sr.results.map((r) => r.test_case_id));
      const untestedCases = testCases.filter((tc) => tc.id && !testedIds.has(tc.id));
      const { recommendations: recs } = await testAutomationApi.analyzeImprovements(`suite-${Date.now()}`, featureId, {
        api_timings: apiTimings, e2e_timings: e2eTimings,
        criteria_coverage: { total_criteria: testCases.length, tested_criteria: testedIds.size, untested_criteria: untestedCases.map((tc) => tc.title) },
      });
      setRecommendations(recs);
    } catch { await fetchRecommendations(); }
    setLoadingRecs(false);
  }, [featureId, testCases, fetchRecommendations]);

  const executeAfterPreflight = useCallback(async () => {
    setPhase('running');
    setSuiteResult(null);
    setRecommendations([]);
    const result = await auto.executeSuite(environment, ext.executeTestScript);
    if (result) {
      setSuiteResult(result);
      onResultsReady(mapSuiteToResults(result));
      setPhase('done');
      triggerImprovementAnalysis(result);
    } else { setPhase('error'); }
  }, [auto, environment, ext.executeTestScript, mapSuiteToResults, onResultsReady, triggerImprovementAnalysis]);

  const handleRunAll = useCallback(async () => {
    if (!ext.isAvailable) { setPhase('error'); return; }
    setPhase('preflight');
    const preflight = await auto.runPreflightCheck(featureCode);
    if (!preflight.passed) { setPhase('preflight-failed'); return; }
    await executeAfterPreflight();
  }, [auto, featureCode, ext.isAvailable, executeAfterPreflight]);

  const handleRunSingle = useCallback(async (script: ScriptListItem) => {
    if (runningScriptId) return;
    if (script.tier === 'api') {
      setRunningScriptId(script.id);
      try {
        const apiResult = await testAutomationApi.executeApiTest(script.id, environment);
        const failureReason = apiResult.result !== 'passed'
          ? apiResult.assertions.find((a: { passed: boolean; description: string }) => !a.passed)?.description || 'API assertion failed'
          : undefined;
        setSingleResults((prev) => ({ ...prev, [script.id]: { result: apiResult.result, duration_ms: apiResult.duration_ms, failure_reason: failureReason } }));
      } catch (err) {
        setSingleResults((prev) => ({ ...prev, [script.id]: { result: 'error', duration_ms: 0, failure_reason: err instanceof Error ? err.message : 'API test execution failed' } }));
      }
      setRunningScriptId(null);
      await auto.loadScripts();
      return;
    }
    if (!ext.isAvailable) return;
    setRunningScriptId(script.id);
    const result = await auto.executeScript(script, environment, ext.executeTestScript);
    const firstFailure = result.failures[0];
    const failureReason = firstFailure ? `Step ${firstFailure.step_number}: ${firstFailure.actual}` : undefined;
    setSingleResults((prev) => ({ ...prev, [script.id]: { result: result.result, duration_ms: result.duration_ms, failure_reason: failureReason } }));
    setRunningScriptId(null);
    await auto.loadScripts();
  }, [auto, environment, ext.isAvailable, ext.executeTestScript, runningScriptId]);

  const markedCount = Object.values(results).filter(Boolean).length;
  const allPassed = auto.scripts.length > 0 && auto.scripts.every(
    (s) => singleResults[s.id]?.result === 'passed' || s.last_run_result === 'passed',
  );

  return (
    <div className="flex flex-col h-full">
      <AutomatedExecuteHeader
        featureCode={featureCode} featureTitle={featureTitle}
        environment={environment} onEnvironmentChange={onEnvironmentChange}
        onSwitchToManual={onSwitchToManual}
        extensionChecking={ext.checking} extensionAvailable={ext.isAvailable}
        connectionError={ext.connectionError ?? null} phase={phase}
        submitError={submitError}
      />

      <div className={`flex-1 min-h-0 p-4 ${phase === 'running' ? 'flex flex-col' : 'overflow-y-auto space-y-3'}`}>
        {phase === 'loading' && <PhaseIndicator label="Loading test scripts..." />}

        {phase === 'error' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800 mb-1">Automation Error</p>
            <p className="text-xs text-red-700 mb-3">
              {!ext.isAvailable ? 'Browser extension is required for real test execution. Install SpecKit DevTools and reload.' : (auto.error ?? 'Failed to generate or run scripts')}
            </p>
            <button onClick={onSwitchToManual} className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded hover:bg-red-100">Test Manually</button>
          </div>
        )}

        {phase === 'preflight' && <PhaseIndicator label="Running preflight checks..." />}

        {phase === 'preflight-failed' && auto.preflightResult && (
          <PreflightReport result={auto.preflightResult}
            onRetry={async () => { const r = await auto.runPreflightCheck(featureCode); if (r.passed) await executeAfterPreflight(); }}
            onRunAnyway={executeAfterPreflight} isRetrying={auto.preflightRunning} />
        )}

        {phase === 'ready' && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{auto.scripts.length} Automated Scripts</h4>
              <div className="flex gap-2">
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded">{auto.scripts.filter(s => s.tier === 'api').length} API</span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-700 rounded">{auto.scripts.filter(s => s.tier === 'e2e').length} E2E</span>
              </div>
            </div>
            <ScriptList scripts={auto.scripts} onRunSingle={handleRunSingle} runningScriptId={runningScriptId} singleResults={singleResults} />
            {auto.scripts.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-gray-500">No test scripts found for this feature.</p>
                <p className="text-xs text-gray-400">Run <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-indigo-600">\generate-tests {featureCode}</code> in Claude Code to generate scripts from actual source code.</p>
                <button onClick={onSwitchToManual} className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-50">Test Manually Instead</button>
              </div>
            )}
          </>
        )}

        {phase === 'running' && <RunningProgress progress={auto.executingProgress} scripts={auto.scripts} liveResults={auto.liveResults} />}

        {phase === 'done' && suiteResult && (
          <AutomatedExecuteDoneView suiteResult={suiteResult} testCases={testCases} results={results}
            markedCount={markedCount} loadingRecs={loadingRecs} recommendations={recommendations}
            onUpdateRecommendation={handleUpdateRecommendation} />
        )}
      </div>

      <AutomatedExecuteFooter
        phase={phase} onBack={onBack} onClose={onClose}
        onStopTests={() => { auto.stopExecution(); setPhase('done'); }}
        onRunAll={handleRunAll} onSubmit={onSubmit}
        isSubmitting={isSubmitting} markedCount={markedCount}
        extensionAvailable={ext.isAvailable} hasScripts={auto.scripts.length > 0}
        allPassed={allPassed}
      />
    </div>
  );
}
