/**
 * useEvidenceCapture - Captures step evidence via the browser extension.
 * Handles partial capture: if screenshot fails, still returns DOM/console/network.
 */

import { useState, useCallback } from 'react';
import { useExtensionBridge } from './useExtensionBridge';
import type { StepEvidence, GuidedStep, CaptureEvidenceResult } from './guided-testing-types';

interface EvidenceCaptureState {
  capturing: boolean;
  lastCapture: CaptureEvidenceResult | null;
  error: string | null;
}

export function useEvidenceCapture() {
  const extension = useExtensionBridge();
  const [state, setState] = useState<EvidenceCaptureState>({
    capturing: false,
    lastCapture: null,
    error: null,
  });

  /** Capture evidence for a given step number, optionally targeting a specific URL's tab */
  const captureEvidence = useCallback(
    async (stepNumber: number, targetUrl?: string): Promise<CaptureEvidenceResult | null> => {
      if (!extension.isAvailable) return null;

      setState((prev) => ({ ...prev, capturing: true, error: null }));
      try {
        const result = await extension.captureEvidence(stepNumber, targetUrl);
        if (!result) {
          setState({
            capturing: false,
            lastCapture: null,
            error:
              'Extension did not return evidence — check that the extension is active and reload the page',
          });
          return null;
        }
        setState({ capturing: false, lastCapture: result, error: null });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Evidence capture failed';
        setState({ capturing: false, lastCapture: null, error: message });
        return null;
      }
    },
    [extension]
  );

  /** Build a StepEvidence record from a guided step + verdict + captured data */
  const buildStepEvidence = useCallback(
    (
      step: GuidedStep,
      verdict: 'passed' | 'failed' | 'skipped',
      notes: string,
      captured: CaptureEvidenceResult | null,
      validation?: StepEvidence['validation']
    ): StepEvidence => ({
      step_number: step.step_number,
      timestamp: new Date().toISOString(),
      criterion_id: step.criterion_id,
      criterion_text: step.criterion_text,
      action: step.action,
      expected_outcome: step.expected_outcome,
      actual_outcome: notes || (verdict === 'passed' ? 'As expected' : 'See notes'),
      verdict,
      override: false,
      screenshot: captured?.screenshot,
      page_state: captured?.page_state,
      console_output: captured?.console_output,
      network_log: captured?.network_log,
      validation,
    }),
    []
  );

  /** Load evidence previously captured via the extension popup (for navigation steps) */
  const loadStoredEvidence = useCallback(async (): Promise<CaptureEvidenceResult | null> => {
    if (!extension.isAvailable) return null;

    setState((prev) => ({ ...prev, capturing: true, error: null }));
    try {
      const result = await extension.getStoredEvidence();
      if (!result) {
        setState({
          capturing: false,
          lastCapture: null,
          error:
            'No stored evidence found — capture evidence on the test page first using the SpecKit extension',
        });
        return null;
      }
      setState({ capturing: false, lastCapture: result, error: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stored evidence';
      setState({ capturing: false, lastCapture: null, error: message });
      return null;
    }
  }, [extension]);

  /** Clear any loaded/uploaded evidence */
  const clearEvidence = useCallback(() => {
    setState({ capturing: false, lastCapture: null, error: null });
  }, []);

  /** Manually set a screenshot (e.g. from file upload) as evidence */
  const setManualScreenshot = useCallback((dataUrl: string) => {
    const result: CaptureEvidenceResult = {
      screenshot: dataUrl,
      page_state: {
        url: '',
        title: 'Manual upload',
        viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
        visible_elements: [],
      },
      console_output: [],
      network_log: [],
      timestamp: new Date().toISOString(),
    };
    setState({ capturing: false, lastCapture: result, error: null });
  }, []);

  return {
    ...state,
    extensionAvailable: extension.isAvailable,
    captureEvidence,
    loadStoredEvidence,
    setManualScreenshot,
    clearEvidence,
    buildStepEvidence,
  };
}
