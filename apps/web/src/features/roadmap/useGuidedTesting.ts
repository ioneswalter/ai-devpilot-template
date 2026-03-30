/**
 * Core hook for AI Testing Co-Pilot guided testing flow (FR-108 J1).
 * Manages session state, step navigation, AI guidance, and FR-111 preconditions.
 */

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/api-helpers';
import { testDataApi } from '@/lib/api/test-data-api';
import { useExtensionBridge } from './useExtensionBridge';
import type {
  GuidedStep,
  GenerateGuidanceResponse,
  StepEvidence,
  GuidedTestEvidence,
  ValidationResult,
  CaptureEvidenceResult,
} from './guided-testing-types';

type GuidedPhase = 'idle' | 'checking-data' | 'loading' | 'active' | 'completed' | 'error';

interface GuidedState {
  phase: GuidedPhase;
  sessionId: string | null;
  steps: GuidedStep[];
  currentStepIndex: number;
  evidence: StepEvidence[];
  error: string | null;
  needsTestData: boolean;
  generatingData: boolean;
}

const INITIAL_STATE: GuidedState = {
  phase: 'idle',
  sessionId: null,
  steps: [],
  currentStepIndex: 0,
  evidence: [],
  error: null,
  needsTestData: false,
  generatingData: false,
};

export function useGuidedTesting(featureId: string) {
  const [state, setState] = useState<GuidedState>(INITIAL_STATE);
  const extension = useExtensionBridge();
  const startTime = useState(() => Date.now())[0];

  const updateState = useCallback((patch: Partial<GuidedState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Check FR-111 test data and start guided testing */
  const startGuidedTesting = useCallback(async (testCaseId: string) => {
    updateState({ phase: 'checking-data', error: null });

    try {
      // Check if test data exists (FR-111 integration)
      const checkResult = await testDataApi.check(featureId);
      if (!checkResult.data.has_active_data) {
        updateState({ phase: 'idle', needsTestData: true });
        return;
      }

      await generateGuidance(testCaseId);
    } catch (err) {
      updateState({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to check test data' });
    }
  }, [featureId, updateState]);

  /** Generate test data then start guidance */
  const generateTestDataAndStart = useCallback(async (testCaseId: string) => {
    updateState({ generatingData: true, needsTestData: false });
    try {
      await testDataApi.generate({ feature_id: featureId, trigger_source: 'copilot' });
      updateState({ generatingData: false });
      await generateGuidance(testCaseId);
    } catch (err) {
      updateState({
        generatingData: false,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Failed to generate test data',
      });
    }
  }, [featureId, updateState]);

  /** Skip test data check and proceed */
  const skipTestDataCheck = useCallback(async (testCaseId: string) => {
    updateState({ needsTestData: false });
    await generateGuidance(testCaseId);
  }, [updateState]);

  /** Core: get page state and call generate-guidance API */
  async function generateGuidance(testCaseId: string) {
    updateState({ phase: 'loading' });
    try {
      const pageState = await extension.getPageState();
      const response = await apiClient<{ data: GenerateGuidanceResponse }>(
        'guided-testing?action=generate-guidance',
        {
          method: 'POST',
          body: JSON.stringify({
            feature_id: featureId,
            test_case_id: testCaseId,
            page_state: pageState,
          }),
        },
      );

      updateState({
        phase: 'active',
        sessionId: response.data.session_id,
        steps: response.data.steps,
        currentStepIndex: 0,
        evidence: [],
      });
    } catch (err) {
      updateState({
        phase: 'error',
        error: err instanceof Error ? err.message : 'Failed to generate guidance',
      });
    }
  }

  /** Navigate steps */
  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.min(prev.currentStepIndex + 1, prev.steps.length - 1),
    }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.max(prev.currentStepIndex - 1, 0),
    }));
  }, []);

  /** Record step evidence */
  const recordStepEvidence = useCallback((evidence: StepEvidence) => {
    setState((prev) => {
      const updated = [...prev.evidence];
      const idx = updated.findIndex((e) => e.step_number === evidence.step_number);
      if (idx >= 0) updated[idx] = evidence;
      else updated.push(evidence);
      return { ...prev, evidence: updated };
    });
  }, []);

  /** Capture evidence for current step via extension */
  const captureCurrentStepEvidence = useCallback(async (): Promise<CaptureEvidenceResult | null> => {
    const step = state.steps[state.currentStepIndex];
    if (!step) return null;
    return extension.captureEvidence(step.step_number);
  }, [state.steps, state.currentStepIndex, extension]);

  /** Complete the guided session */
  const completeSession = useCallback(async (): Promise<GuidedTestEvidence | null> => {
    if (!state.sessionId) return null;

    const duration = Date.now() - startTime;
    try {
      await apiClient('guided-testing?action=complete-session', {
        method: 'POST',
        body: JSON.stringify({
          session_id: state.sessionId,
          status: 'completed',
          completed_steps: state.evidence.length,
          duration_ms: duration,
        }),
      });
    } catch { /* non-critical */ }

    const guidedEvidence: GuidedTestEvidence = {
      type: 'guided',
      session_id: state.sessionId,
      steps: state.evidence,
    };

    updateState({ phase: 'completed' });
    return guidedEvidence;
  }, [state.sessionId, state.evidence, startTime, updateState]);

  /** Abandon the guided session */
  const abandonSession = useCallback(async () => {
    if (state.sessionId) {
      try {
        await apiClient('guided-testing?action=complete-session', {
          method: 'POST',
          body: JSON.stringify({
            session_id: state.sessionId,
            status: 'abandoned',
            completed_steps: state.evidence.length,
            duration_ms: Date.now() - startTime,
          }),
        });
      } catch { /* non-critical */ }
    }
    setState(INITIAL_STATE);
  }, [state.sessionId, state.evidence.length, startTime]);

  const currentStep = state.steps[state.currentStepIndex] ?? null;
  const isLastStep = state.currentStepIndex >= state.steps.length - 1;
  const progress = state.steps.length > 0 ? (state.currentStepIndex + 1) / state.steps.length : 0;

  return {
    ...state,
    currentStep,
    isLastStep,
    progress,
    extensionAvailable: extension.isAvailable,
    extensionChecking: extension.checking,
    startGuidedTesting,
    generateTestDataAndStart,
    skipTestDataCheck,
    nextStep,
    prevStep,
    recordStepEvidence,
    captureCurrentStepEvidence,
    completeSession,
    abandonSession,
  };
}
