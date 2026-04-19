/**
 * TestRunPanel — Modal content for test execution and status.
 * Opens to status overview; admin clicks "Run Tests" to enter marking mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import { supabase } from '@/lib/supabase-client';
import { useTestExecution } from './useTestExecution';
import { AutomatedExecuteView } from './AutomatedExecuteView';
import { useCriteriaCoverage } from './useCriteriaCoverage';
import { loadDraft, saveDraft, clearDraft, BuildRequiredGate, BuildReviewGate } from './TestRunPanelGates';
import { TestRunStatusView } from './TestRunStatusView';
import { TestRunManualView } from './TestRunManualView';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult, TestResultInput } from './test-execution-types';

interface TestRunPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  testCases: TestCase[];
  acceptanceCriteria?: string[];
  onClose: () => void;
  onComplete: () => void;
  onRefresh?: () => void;
}

type PanelView = 'status' | 'execute' | 'manual';

export function TestRunPanel({
  featureId, featureCode, featureTitle, featureStatus, testCases, acceptanceCriteria, onClose, onComplete, onRefresh,
}: TestRunPanelProps) {
  const exec = useTestExecution(featureId);
  const draft = useRef(loadDraft(featureId)).current;
  const [view, setView] = useState<PanelView>(draft?.view ?? 'status');
  const [environment, setEnvironment] = useState(draft?.environment ?? 'development');
  const [results, setResults] = useState<Record<string, TestRunResult | null>>(draft?.results ?? {});
  const [notes, setNotes] = useState<Record<string, string>>(draft?.notes ?? {});

  const persistDraft = useCallback(() => {
    if (view === 'execute') saveDraft(featureId, { view, environment, results, notes });
  }, [featureId, view, environment, results, notes]);
  useEffect(() => { persistDraft(); }, [persistDraft]);

  const lastRunResults: Record<string, TestRunResult> = {};
  for (const entry of exec.history) {
    if (!lastRunResults[entry.test_case_id]) lastRunResults[entry.test_case_id] = entry.result;
  }

  const coverage = useCriteriaCoverage({
    criteria: acceptanceCriteria ?? [],
    testCases: testCases.filter((tc) => tc.id).map((tc) => ({ id: tc.id!, test_code: tc.test_code, title: tc.title, passed: tc.passed ?? null })),
    testRuns: exec.history.map((h) => ({ test_case_id: h.test_case_id, evidence: h.evidence ?? null, result: h.result, executed_at: h.executed_at })),
  });

  const markedCount = Object.values(results).filter(Boolean).length;

  const buildSubmitEntries = (): TestResultInput[] =>
    testCases.filter((tc) => results[tc.id!]).map((tc) => ({
      test_case_id: tc.id!, result: results[tc.id!]!, notes: notes[tc.id!] || undefined,
    }));

  const handleSubmit = () => {
    const entries = buildSubmitEntries();
    if (entries.length === 0) return;
    exec.submitResults(environment, entries);
    setResults({}); setNotes({}); clearDraft(featureId);
  };

  if (exec.isSubmitSuccess && (view === 'execute' || view === 'manual')) {
    onRefresh?.(); setView('status'); exec.resetSubmit(); clearDraft(featureId);
  }

  const handleAutoResults = useCallback((autoResults: Record<string, TestRunResult>) => { setResults(autoResults); }, []);
  const handleAutoSubmit = useCallback((env: string) => {
    const entries = buildSubmitEntries();
    if (entries.length === 0) return;
    exec.submitResults(env, entries);
    clearDraft(featureId);
  }, [testCases, results, notes, exec, featureId]);

  const testHistory = exec.history ?? [];
  const latestTestTime = testHistory.length > 0 ? Math.max(...testHistory.map((r) => new Date(r.executed_at).getTime())) : 0;
  const deployGateQuery = useQuery({
    queryKey: ['deploy-gate', featureId, latestTestTime],
    queryFn: async () => {
      try {
        const res = await adminApi.getPipelineRunStatus(featureId);
        const runs = [...(res.data?.history ?? [])];
        if (res.data?.active) runs.push(res.data.active);
        const deployedRuns = runs.filter((r) => r.deploy_results?.overall_status === 'success');
        if (deployedRuns.length === 0) return { deployed: false };
        const latestDeployTime = Math.max(...deployedRuns.map((r) => new Date(r.completed_at || r.started_at).getTime()));
        return { deployed: latestTestTime > 0 && latestDeployTime > latestTestTime };
      } catch { return { deployed: false }; }
    },
    staleTime: 30_000, enabled: latestTestTime > 0,
  });
  const isDeployed = deployGateQuery.data?.deployed ?? false;

  const passedCount = testCases.filter((tc) => tc.passed === true).length;
  const failedCount = testCases.filter((tc) => tc.passed === false).length;
  const skippedCount = testCases.filter((tc) => tc.passed == null && tc.id && lastRunResults[tc.id] === 'skipped').length;
  const notRunCount = testCases.filter((tc) => tc.passed == null).length - skippedCount;
  const allPassed = testCases.length > 0 && failedCount === 0 && notRunCount === 0 && skippedCount === 0;

  const buildGateQuery = useQuery({
    queryKey: ['build-gate', featureId],
    queryFn: async () => {
      try {
        const res = await adminApi.getImplementation(featureId);
        const tasks = res.data?.task_items ?? [];
        return { hasTasks: tasks.length > 0, pending: tasks.filter((t: { decision: string }) => t.decision === 'pending').length, rejected: tasks.filter((t: { decision: string }) => t.decision === 'rejected').length };
      } catch { return { hasTasks: false, pending: 0, rejected: 0 }; }
    },
    enabled: featureStatus === 'in_development', staleTime: 5_000,
  });
  const buildPending = buildGateQuery.data?.pending ?? 0;
  const buildRejected = buildGateQuery.data?.rejected ?? 0;
  const buildNeedsReview = featureStatus === 'in_development' && (buildPending > 0 || buildRejected > 0);

  // FR-149 v1.1: Detect if feature has a newer version needing tests
  const versionQuery = useQuery({
    queryKey: ['feature-version-test', featureId],
    queryFn: async () => {
      const { data: versions } = await supabase
        .from('feature_versions')
        .select('id, version_label, version_number, superseded_by')
        .eq('feature_id', featureId)
        .order('version_number', { ascending: false });
      if (!versions || versions.length === 0) return null;
      const current = versions.find(v => v.superseded_by === null);
      if (!current || current.version_number <= 1) return null;
      const prior = versions.find(v => v.superseded_by !== null);
      return { currentLabel: current.version_label, priorLabel: prior?.version_label ?? 'v1.0' };
    },
    staleTime: 30_000,
  });
  const versionInfo = versionQuery.data;

  const needsBuild = featureStatus === 'proposed' || featureStatus === 'reviewed' || featureStatus === 'specified';
  if (needsBuild) return <BuildRequiredGate featureCode={featureCode} featureTitle={featureTitle} featureStatus={featureStatus} onClose={onClose} />;
  if (buildNeedsReview) return <BuildReviewGate featureCode={featureCode} featureTitle={featureTitle} buildPending={buildPending} buildRejected={buildRejected} onClose={onClose} />;

  if (view === 'status') {
    return (
      <>
        {versionInfo && (
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-purple-100 text-purple-700">{versionInfo.currentLabel}</span>
              <span className="text-sm font-medium text-purple-900">New version needs test generation</span>
            </div>
            <p className="text-xs text-purple-700">
              The tests below are from {versionInfo.priorLabel} (passed). Run <code className="bg-purple-100 px-1 rounded">\generate-tests {featureCode}</code> in Claude Code to generate tests for the {versionInfo.currentLabel} delta criteria.
            </p>
          </div>
        )}
        <TestRunStatusView
          featureId={featureId} featureCode={featureCode} featureTitle={featureTitle}
          featureStatus={featureStatus} testCases={testCases} acceptanceCriteria={acceptanceCriteria}
          coverage={coverage} lastRunResults={lastRunResults} history={exec.history}
          isLoading={exec.isLoading} passedCount={passedCount} failedCount={failedCount}
          skippedCount={skippedCount} notRunCount={notRunCount} allPassed={allPassed}
          isDeployed={isDeployed}
          onRunTests={(prefilled) => { setResults(prefilled); setNotes({}); setView('execute'); }}
          onComplete={onComplete} onRefresh={onRefresh} onClose={onClose}
        />
      </>
    );
  }

  if (view === 'execute') {
    return (
      <AutomatedExecuteView
        featureId={featureId} featureCode={featureCode} featureTitle={featureTitle}
        testCases={testCases} environment={environment} onEnvironmentChange={setEnvironment}
        onResultsReady={handleAutoResults} onSubmit={() => handleAutoSubmit(environment)}
        isSubmitting={exec.isSubmitting} submitError={exec.submitError} results={results}
        onBack={() => { setView('status'); setResults({}); setNotes({}); clearDraft(featureId); }}
        onClose={onClose} onSwitchToManual={() => setView('manual')}
      />
    );
  }

  return (
    <TestRunManualView
      featureId={featureId} featureCode={featureCode} featureTitle={featureTitle}
      testCases={testCases} environment={environment} onEnvironmentChange={setEnvironment}
      results={results} onResultChange={(id, r) => setResults((prev) => ({ ...prev, [id]: r }))}
      notes={notes} onNotesChange={(id, n) => setNotes((prev) => ({ ...prev, [id]: n }))}
      lastRunResults={lastRunResults} submitError={exec.submitError} isSubmitting={exec.isSubmitting}
      markedCount={markedCount} onSubmit={handleSubmit}
      onSwitchToAutomated={() => setView('execute')}
      onBackToOverview={() => { setView('status'); setResults({}); setNotes({}); clearDraft(featureId); }}
      onClose={onClose}
    />
  );
}
