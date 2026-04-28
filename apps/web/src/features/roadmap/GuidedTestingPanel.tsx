/**
 * GuidedTestingPanel - Orchestrates the AI-guided testing flow.
 * Shows step list, progress bar, capture controls, and session actions.
 */

import { useState, useCallback } from 'react';
import { GuidedStepCard } from './GuidedStepCard';
import { useGuidedTesting } from './useGuidedTesting';
import { useEvidenceCapture } from './useEvidenceCapture';
import { ExploratorySuggestions } from './ExploratorySuggestions';
import { ProgressBar, ValidationWarningPanel } from './GuidedTestingPanelWidgets';
import {
  IdleView,
  TestDataView,
  LoadingView,
  ErrorView,
  CompletedView,
} from './GuidedTestingPhaseViews';
import { apiClient } from '@/lib/api/api-helpers';
import { adminApi } from '@/lib/api/admin-api';
import type {
  GuidedTestEvidence,
  ValidationResult,
  ExploratorySuggestion,
} from './guided-testing-types';

interface GuidedTestingPanelProps {
  featureId: string;
  testCaseId: string;
  onComplete: (evidence: GuidedTestEvidence) => void;
  onClose: () => void;
}

export function GuidedTestingPanel({
  featureId,
  testCaseId,
  onComplete,
  onClose,
}: GuidedTestingPanelProps) {
  const guided = useGuidedTesting(featureId, testCaseId);
  const evidenceCapture = useEvidenceCapture();
  const [validationWarning, setValidationWarning] = useState<ValidationResult | null>(null);
  const [pendingVerdict, setPendingVerdict] = useState<{
    verdict: 'passed' | 'failed' | 'skipped';
    notes: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<ExploratorySuggestion[]>([]);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);

  const handleStart = useCallback(
    () => guided.startGuidedTesting(testCaseId),
    [guided, testCaseId]
  );

  const handleCapture = useCallback(async () => {
    const step = guided.currentStep;
    if (!step) return;
    const isOnAnotherPage = !!getTargetUrl();
    if (isOnAnotherPage) await evidenceCapture.loadStoredEvidence();
    else await evidenceCapture.captureEvidence(step.step_number);
  }, [guided, evidenceCapture]);

  const validateStep = useCallback(
    async (
      sessionId: string,
      step: { step_number: number; expected_outcome: string },
      captured: { page_state?: unknown; console_output?: string[]; network_log?: unknown[] } | null
    ): Promise<ValidationResult | null> => {
      if (!captured?.page_state) return null;
      try {
        const res = await apiClient<{ data: ValidationResult }>(
          'guided-testing?action=validate-state',
          {
            method: 'POST',
            body: JSON.stringify({
              session_id: sessionId,
              step_number: step.step_number,
              expected_outcome: step.expected_outcome,
              actual_page_state: captured.page_state,
              console_errors: captured.console_output,
              failed_requests: captured.network_log,
            }),
          }
        );
        return res.data;
      } catch {
        return null;
      }
    },
    []
  );

  const fetchSuggestions = useCallback(
    async (
      step: { step_number: number; action: string; expected_outcome: string },
      notes: string,
      captured: { page_state?: unknown; console_output?: string[]; network_log?: unknown[] } | null
    ) => {
      if (!guided.sessionId) return;
      try {
        const res = await apiClient<{ data: { suggestions: ExploratorySuggestion[] } }>(
          'guided-testing?action=suggest-exploratory',
          {
            method: 'POST',
            body: JSON.stringify({
              session_id: guided.sessionId,
              feature_id: featureId,
              failure_context: {
                step_number: step.step_number,
                action: step.action,
                expected_outcome: step.expected_outcome,
                actual_outcome: notes || 'Failed',
                console_errors: captured?.console_output,
                failed_requests: captured?.network_log,
                page_state: captured?.page_state ?? {},
              },
              existing_test_codes: [],
            }),
          }
        );
        if (res.data.suggestions.length > 0) setSuggestions(res.data.suggestions);
      } catch {
        /* non-critical */
      }
    },
    [guided.sessionId, featureId]
  );

  const handleAcceptSuggestion = useCallback(
    async (suggestion: ExploratorySuggestion) => {
      setAcceptingSuggestion(true);
      try {
        await adminApi.createAdHocTestCase({
          feature_id: featureId,
          title: suggestion.title,
          steps: suggestion.steps,
          expected_result: suggestion.expected_outcome,
          test_type: 'exploratory',
        });
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      } catch {
        /* non-critical */
      }
      setAcceptingSuggestion(false);
    },
    [featureId]
  );

  const getTargetUrl = useCallback(() => {
    const step = guided.currentStep;
    if (!step) return undefined;
    return (
      step.requires_navigation ??
      guided.steps
        .slice(0, guided.currentStepIndex)
        .reverse()
        .find((s) => s.requires_navigation)?.requires_navigation
    );
  }, [guided]);

  const finalizeStep = useCallback(
    async (
      verdict: 'passed' | 'failed' | 'skipped',
      notes: string,
      validation?: ValidationResult | null,
      override = false
    ) => {
      const step = guided.currentStep;
      if (!step) return;
      const isOnAnotherPage = !!getTargetUrl();
      let captured: Awaited<ReturnType<typeof evidenceCapture.captureEvidence>> = null;
      if (evidenceCapture.extensionAvailable) {
        captured = isOnAnotherPage
          ? await evidenceCapture.loadStoredEvidence()
          : await evidenceCapture.captureEvidence(step.step_number);
      }
      const stepEvidence = evidenceCapture.buildStepEvidence(
        step,
        verdict,
        notes,
        captured,
        validation ?? undefined
      );
      if (override) stepEvidence.override = true;
      guided.recordStepEvidence(stepEvidence);
      setValidationWarning(null);
      setPendingVerdict(null);
      if (verdict === 'failed') fetchSuggestions(step, notes, captured);
      else setSuggestions([]);
      if (guided.isLastStep) {
        const result = await guided.completeSession();
        if (result) onComplete(result);
      } else guided.nextStep();
    },
    [guided, evidenceCapture, onComplete, fetchSuggestions, getTargetUrl]
  );

  const handleMarkComplete = useCallback(
    async (verdict: 'passed' | 'failed' | 'skipped', notes: string) => {
      const step = guided.currentStep;
      if (!step || !guided.sessionId) {
        await finalizeStep(verdict, notes);
        return;
      }
      if (verdict === 'passed' && evidenceCapture.extensionAvailable) {
        if (getTargetUrl()) {
          await finalizeStep(verdict, notes);
          return;
        }
        const captured = await evidenceCapture.captureEvidence(step.step_number);
        const validation = await validateStep(guided.sessionId, step, captured);
        if (validation && !validation.matches_expected) {
          setValidationWarning(validation);
          setPendingVerdict({ verdict, notes });
          return;
        }
        await finalizeStep(verdict, notes, validation);
        return;
      }
      await finalizeStep(verdict, notes);
    },
    [guided, evidenceCapture, validateStep, finalizeStep]
  );

  if (guided.phase === 'idle' && !guided.needsTestData)
    return (
      <IdleView
        extensionAvailable={guided.extensionAvailable}
        extensionChecking={guided.extensionChecking}
        onStart={handleStart}
      />
    );
  if (guided.needsTestData)
    return (
      <TestDataView
        generating={guided.generatingData}
        testCaseId={testCaseId}
        onGenerate={() => guided.generateTestDataAndStart(testCaseId)}
        onSkip={() => guided.skipTestDataCheck(testCaseId)}
      />
    );
  if (guided.phase === 'checking-data' || guided.phase === 'loading')
    return <LoadingView phase={guided.phase} />;
  if (guided.phase === 'error') return <ErrorView error={guided.error} onRetry={handleStart} />;
  if (guided.phase === 'completed')
    return (
      <CompletedView
        stepsTotal={guided.steps.length}
        passed={guided.evidence.filter((e) => e.verdict === 'passed').length}
        failed={guided.evidence.filter((e) => e.verdict === 'failed').length}
      />
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">
          Step {guided.currentStepIndex + 1} of {guided.steps.length}
        </span>
        <button
          onClick={async () => {
            await guided.abandonSession();
            onClose();
          }}
          className="text-[10px] text-red-500 hover:text-red-700"
        >
          Abandon
        </button>
      </div>
      <ProgressBar progress={guided.progress} />
      {validationWarning && pendingVerdict && (
        <ValidationWarningPanel
          validationWarning={validationWarning}
          pendingVerdict={pendingVerdict}
          onOverride={() =>
            finalizeStep(pendingVerdict.verdict, pendingVerdict.notes, validationWarning, true)
          }
          onCancel={() => {
            setValidationWarning(null);
            setPendingVerdict(null);
          }}
        />
      )}
      {suggestions.length > 0 && (
        <ExploratorySuggestions
          suggestions={suggestions}
          onAccept={handleAcceptSuggestion}
          onDismiss={(id) => setSuggestions((prev) => prev.filter((s) => s.id !== id))}
          accepting={acceptingSuggestion}
        />
      )}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {guided.steps.map((step, idx) => (
          <GuidedStepCard
            key={step.step_number}
            step={step}
            isActive={idx === guided.currentStepIndex}
            evidence={guided.evidence.find((e) => e.step_number === step.step_number) ?? null}
            onMarkComplete={handleMarkComplete}
            onCapture={handleCapture}
            capturing={evidenceCapture.capturing}
            extensionAvailable={evidenceCapture.extensionAvailable}
            captureError={evidenceCapture.error}
            lastCaptureSuccess={evidenceCapture.lastCapture !== null && !evidenceCapture.capturing}
            lastCapture={evidenceCapture.lastCapture}
            isOnAnotherPage={guided.steps.slice(0, idx + 1).some((s) => s.requires_navigation)}
            onUploadScreenshot={(dataUrl) => evidenceCapture.setManualScreenshot(dataUrl)}
            onClearEvidence={() => evidenceCapture.clearEvidence()}
          />
        ))}
      </div>
    </div>
  );
}
