/**
 * Hook: Browser extension bridge for AI Testing Co-Pilot (FR-108)
 * Communicates with the extension content script via window.postMessage.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  PageState,
  CaptureEvidenceResult,
  ExtensionCapabilities,
} from './guided-testing-types';
import type { ScriptStep } from './automation-types';

export interface TestStepResult {
  step_number: number;
  passed: boolean;
  actual_outcome: string;
  duration_ms: number;
}

export interface TestScriptExecutionResult {
  results: TestStepResult[];
  passed: number;
  failed: number;
  duration_ms: number;
  screenshots: Record<string, string>;
}

let requestCounter = 0;

interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  version?: string;
  capabilities?: string[];
}

/** Send a message to the extension content script via window.postMessage */
function sendToExtension(
  type: string,
  payload?: Record<string, unknown>,
  timeoutMs = 3000,
): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    const requestId = `speckit_${++requestCounter}_${Date.now()}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: 'Extension timeout' });
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== 'SPECKIT_RESPONSE') return;
      if (event.data?.requestId !== requestId) return;

      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(event.data as ExtensionResponse);
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: `SPECKIT_${type}`, requestId, payload }, '*');
  });
}

export function useExtensionBridge() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<ExtensionCapabilities>({
    screenshot: false, dom: false, console: false, network: false,
  });
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const checkExtension = useCallback(async () => {
    setChecking(true);
    setConnectionError(null);
    const resp = await sendToExtension('CHECK_EXTENSION');
    if (resp.success && resp.capabilities) {
      setIsAvailable(true);
      setConnectionError(null);
      setCapabilities({
        screenshot: resp.capabilities.includes('screenshot'),
        dom: resp.capabilities.includes('dom'),
        console: resp.capabilities.includes('console'),
        network: resp.capabilities.includes('network'),
      });
    } else {
      setIsAvailable(false);
      setConnectionError(resp.error || 'Extension not available');
    }
    setChecking(false);
    return resp.success;
  }, []);

  useEffect(() => {
    checkExtension();
  }, [checkExtension]);

  const getPageState = useCallback(async (): Promise<PageState | null> => {
    const resp = await sendToExtension('GET_PAGE_STATE');
    if (resp.success && resp.data) {
      return resp.data as PageState;
    }
    return null;
  }, []);

  const captureEvidence = useCallback(
    async (stepNumber: number, targetUrl?: string): Promise<CaptureEvidenceResult | null> => {
      const resp = await sendToExtension('CAPTURE_EVIDENCE', { step_number: stepNumber, target_url: targetUrl }, 8000);
      if (resp.success && resp.data) {
        return resp.data as CaptureEvidenceResult;
      }
      return null;
    },
    [],
  );

  /** Retrieve evidence previously captured via the extension popup button */
  const getStoredEvidence = useCallback(
    async (): Promise<CaptureEvidenceResult | null> => {
      const resp = await sendToExtension('GET_LAST_EVIDENCE', {}, 5000);
      if (resp.success && resp.data) {
        return resp.data as CaptureEvidenceResult;
      }
      return null;
    },
    [],
  );

  /** Execute a full test script via the browser extension (real browser actions) */
  const executeTestScript = useCallback(
    async (steps: ScriptStep[], baseUrl?: string): Promise<TestScriptExecutionResult | null> => {
      // Generous timeout: 10s per step + 30s overhead
      const timeoutMs = (steps.length * 10000) + 30000;
      console.log('[SpecKit Bridge] executeTestScript called with', steps.length, 'steps, timeout:', timeoutMs);
      const resp = await sendToExtension(
        'EXECUTE_TEST_SCRIPT',
        { steps, base_url: baseUrl || window.location.origin },
        timeoutMs,
      );
      console.log('[SpecKit Bridge] executeTestScript response:', JSON.stringify(resp).slice(0, 500));
      if (resp.success && resp.data) {
        return resp.data as TestScriptExecutionResult;
      }
      console.warn('[SpecKit Bridge] executeTestScript failed:', resp.error);
      return null;
    },
    [],
  );

  return {
    isAvailable,
    capabilities,
    checking,
    connectionError,
    checkExtension,
    getPageState,
    captureEvidence,
    getStoredEvidence,
    executeTestScript,
  };
}
