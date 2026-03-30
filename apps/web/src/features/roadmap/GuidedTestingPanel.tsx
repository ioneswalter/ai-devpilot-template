/**
 * GuidedTestingPanel - Orchestrates the AI-guided testing flow.
 * Shows step list, progress bar, capture controls, and session actions.
 */

import { useState, useCallback } from 'react';
import { GuidedStepCard } from './GuidedStepCard';
import { useGuidedTesting } from './useGuidedTesting';
import { useEvidenceCapture } from './useEvidenceCapture';
import { ExploratorySuggestions } from './ExploratorySuggestions';
import { apiClient } from '@/lib/api/api-helpers';
import { adminApi } from '@/lib/api/admin-api';
import type { GuidedTestEvidence, ValidationResult, ExploratorySuggestion } from './guided-testing-types';

interface GuidedTestingPanelProps {
  featureId: string;
  testCaseId: string;
  onComplete: (evidence: GuidedTestEvidence) => void;
  onClose: () => void;
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div
        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

function TestDataPrompt({
  generating,
  onGenerate,
  onSkip,
}: {
  generating: boolean;
  onGenerate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
      <p className="font-medium text-amber-800 mb-2">Test Data Required</p>
      <p className="text-amber-700 text-xs mb-3">
        No active test data found. Generate test data for more accurate guidance, or skip to proceed without it.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onGenerate}
          disabled={generating}
          className="px-3 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium"
        >
          {generating ? 'Generating...' : 'Generate Test Data'}
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function ExtensionWarning() {
  return (
    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
      <span className="font-medium">Browser extension not detected.</span>{' '}
      Evidence will not be auto-captured. Install the OwnYourGig extension for full co-pilot features.
    </div>
  );
}

export function GuidedTestingPanel({
  featureId,
  testCaseId,
  onComplete,
  onClose,
}: GuidedTestingPanelProps) {
  const guided = useGuidedTesting(featureId);
  const evidenceCapture = useEvidenceCapture();
  const [validationWarning, setValidationWarning] = useState<ValidationResult | null>(null);
  const [pendingVerdict, setPendingVerdict] = useState<{ verdict: 'passed' | 'failed' | 'skipped'; notes: string } | null>(null);
  const [suggestions, setSuggestions] = useState<ExploratorySuggestion[]>([]);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);

  const handleStart = useCallback(() => {
    guided.startGuidedTesting(testCaseId);
  }, [guided, testCaseId]);

  const handleCapture = useCallback(async () => {
    const step = guided.currentStep;
    if (!step) return;
    await evidenceCapture.captureEvidence(step.step_number);
  }, [guided, evidenceCapture]);

  /** Run validate-state API and return result */
  const validateStep = useCallback(
    async (sessionId: string, step: { step_number: number; expected_outcome: string }, captured: { page_state?: unknown; console_output?: string[]; network_log?: unknown[] } | null): Promise<ValidationResult | null> => {
      if (!captured?.page_state) return null;
      try {
        const res = await apiClient<{ data: ValidationResult }>('guided-testing?action=validate-state', {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            step_number: step.step_number,
            expected_outcome: step.expected_outcome,
            actual_page_state: captured.page_state,
            console_errors: captured.console_output,
            failed_requests: captured.network_log,
          }),
        });
        return res.data;
      } catch {
        return null;
      }
    },
    [],
  );

  /** Fetch exploratory suggestions for a failed step */
  const fetchSuggestions = useCallback(
    async (step: { step_number: number; action: string; expected_outcome: string }, notes: string, captured: { page_state?: unknown; console_output?: string[]; network_log?: unknown[] } | null) => {
      if (!guided.sessionId) return;
      try {
        const res = await apiClient<{ data: { suggestions: ExploratorySuggestion[] } }>('guided-testing?action=suggest-exploratory', {
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
        });
        if (res.data.suggestions.length > 0) {
          setSuggestions(res.data.suggestions);
        }
      } catch { /* non-critical */ }
    },
    [guided.sessionId, featureId],
  );

  /** Accept an exploratory suggestion — create a test case */
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
      } catch { /* non-critical */ }
      setAcceptingSuggestion(false);
    },
    [featureId],
  );

  const handleDismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** Finalize step with evidence and move forward */
  const finalizeStep = useCallback(
    async (verdict: 'passed' | 'failed' | 'skipped', notes: string, validation?: ValidationResult | null, override = false) => {
      const step = guided.currentStep;
      if (!step) return;

      const captured = evidenceCapture.extensionAvailable
        ? await evidenceCapture.captureEvidence(step.step_number)
        : null;

      const stepEvidence = evidenceCapture.buildStepEvidence(step, verdict, notes, captured, validation ?? undefined);
      if (override) stepEvidence.override = true;
      guided.recordStepEvidence(stepEvidence);
      setValidationWarning(null);
      setPendingVerdict(null);

      // Fetch exploratory suggestions on failure
      if (verdict === 'failed') {
        fetchSuggestions(step, notes, captured);
      } else {
        setSuggestions([]);
      }

      if (guided.isLastStep) {
        const result = await guided.completeSession();
        if (result) onComplete(result);
      } else {
        guided.nextStep();
      }
    },
    [guided, evidenceCapture, onComplete, fetchSuggestions],
  );

  const handleMarkComplete = useCallback(
    async (verdict: 'passed' | 'failed' | 'skipped', notes: string) => {
      const step = guided.currentStep;
      if (!step || !guided.sessionId) {
        await finalizeStep(verdict, notes);
        return;
      }

      // Auto-validate if marking as passed
      if (verdict === 'passed' && evidenceCapture.extensionAvailable) {
        const captured = await evidenceCapture.captureEvidence(step.step_number);
        const validation = await validateStep(guided.sessionId, step, captured);

        if (validation && !validation.matches_expected) {
          setValidationWarning(validation);
          setPendingVerdict({ verdict, notes });
          return; // Show warning, don't finalize yet
        }

        await finalizeStep(verdict, notes, validation);
        return;
      }

      await finalizeStep(verdict, notes);
    },
    [guided, evidenceCapture, validateStep, finalizeStep],
  );

  const handleAbandon = useCallback(async () => {
    await guided.abandonSession();
    onClose();
  }, [guided, onClose]);

  // Idle state — show start button
  if (guided.phase === 'idle' && !guided.needsTestData) {
    return (
      <div className="space-y-3">
        {!guided.extensionAvailable && !guided.extensionChecking && <ExtensionWarning />}
        <button
          onClick={handleStart}
          className="w-full py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
        >
          Start AI-Guided Testing
        </button>
      </div>
    );
  }

  // Test data prompt
  if (guided.needsTestData) {
    return (
      <TestDataPrompt
        generating={guided.generatingData}
        onGenerate={() => guided.generateTestDataAndStart(testCaseId)}
        onSkip={() => guided.skipTestDataCheck(testCaseId)}
      />
    );
  }

  // Loading / checking
  if (guided.phase === 'checking-data' || guided.phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-2 text-sm text-gray-600">
          {guided.phase === 'checking-data' ? 'Checking test data...' : 'Generating guidance...'}
        </span>
      </div>
    );
  }

  // Error
  if (guided.phase === 'error') {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <p className="font-medium mb-1">Guidance Error</p>
        <p className="text-xs">{guided.error}</p>
        <button
          onClick={handleStart}
          className="mt-2 px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Completed
  if (guided.phase === 'completed') {
    const passed = guided.evidence.filter((e) => e.verdict === 'passed').length;
    const failed = guided.evidence.filter((e) => e.verdict === 'failed').length;
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
        <p className="font-medium text-green-800 mb-1">Guided Testing Complete</p>
        <p className="text-xs text-green-700">
          {passed} passed, {failed} failed, {guided.evidence.length - passed - failed} skipped
          out of {guided.steps.length} steps.
        </p>
      </div>
    );
  }

  // Active — show step cards
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">
          Step {guided.currentStepIndex + 1} of {guided.steps.length}
        </span>
        <button
          onClick={handleAbandon}
          className="text-[10px] text-red-500 hover:text-red-700"
        >
          Abandon
        </button>
      </div>

      <ProgressBar progress={guided.progress} />

      {/* Validation warning with override */}
      {validationWarning && pendingVerdict && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
          <p className="font-medium text-amber-800 mb-1">Mismatch Detected</p>
          <p className="text-amber-700 mb-1">{validationWarning.explanation}</p>
          {validationWarning.mismatches.length > 0 && (
            <ul className="list-disc list-inside text-amber-600 mb-2">
              {validationWarning.mismatches.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
          {validationWarning.console_issues.length > 0 && (
            <p className="mb-1 text-amber-700">
              <span className="font-medium">Console: </span>
              {validationWarning.console_issues.join('; ')}
            </p>
          )}
          {validationWarning.network_issues.length > 0 && (
            <p className="mb-1 text-amber-700">
              <span className="font-medium">Network: </span>
              {validationWarning.network_issues.join('; ')}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => finalizeStep(pendingVerdict.verdict, pendingVerdict.notes, validationWarning, true)}
              className="px-2.5 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 font-medium"
            >
              Override — Mark as Passed
            </button>
            <button
              onClick={() => { setValidationWarning(null); setPendingVerdict(null); }}
              className="px-2.5 py-1 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Exploratory suggestions (after failed step) */}
      {suggestions.length > 0 && (
        <ExploratorySuggestions
          suggestions={suggestions}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
          accepting={acceptingSuggestion}
        />
      )}

      {/* Step cards */}
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
          />
        ))}
      </div>
    </div>
  );
}
