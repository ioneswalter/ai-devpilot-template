/**
 * Hook: Browser extension bridge for AI Testing Co-Pilot (FR-108)
 * Detects extension, sends CAPTURE_EVIDENCE / GET_PAGE_STATE messages.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  PageState,
  CaptureEvidenceResult,
  ExtensionCapabilities,
} from './guided-testing-types';

// Extension ID from manifest.json externally_connectable
const EXTENSION_ID = 'your-extension-id'; // Replaced at runtime via detection

interface ExtensionMessage {
  type: string;
  payload?: Record<string, unknown>;
}

interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  version?: string;
  capabilities?: string[];
}

function sendToExtension(message: ExtensionMessage): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    try {
      const chromeRuntime = (window as unknown as Record<string, unknown>).chrome as
        { runtime?: { sendMessage?: Function; lastError?: { message?: string } } } | undefined;
      if (!chromeRuntime?.runtime?.sendMessage) {
        resolve({ success: false, error: 'Chrome runtime not available' });
        return;
      }
      // Use externally_connectable pattern — message any extension listening
      chromeRuntime.runtime.sendMessage(
        EXTENSION_ID,
        message,
        (response: ExtensionResponse | undefined) => {
          if (chromeRuntime.runtime?.lastError) {
            resolve({ success: false, error: chromeRuntime.runtime.lastError.message });
            return;
          }
          resolve(response ?? { success: false, error: 'No response' });
        },
      );
    } catch {
      resolve({ success: false, error: 'Extension communication failed' });
    }
  });
}

export function useExtensionBridge() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<ExtensionCapabilities>({
    screenshot: false, dom: false, console: false, network: false,
  });
  const [checking, setChecking] = useState(true);

  const checkExtension = useCallback(async () => {
    setChecking(true);
    const resp = await sendToExtension({ type: 'CHECK_EXTENSION' });
    if (resp.success && resp.capabilities) {
      setIsAvailable(true);
      setCapabilities({
        screenshot: resp.capabilities.includes('screenshot'),
        dom: resp.capabilities.includes('dom'),
        console: resp.capabilities.includes('console'),
        network: resp.capabilities.includes('network'),
      });
    } else {
      setIsAvailable(false);
    }
    setChecking(false);
    return resp.success;
  }, []);

  useEffect(() => {
    checkExtension();
  }, [checkExtension]);

  const getPageState = useCallback(async (): Promise<PageState | null> => {
    const resp = await sendToExtension({ type: 'GET_PAGE_STATE' });
    if (resp.success && resp.data) {
      return resp.data as PageState;
    }
    return null;
  }, []);

  const captureEvidence = useCallback(
    async (stepNumber: number): Promise<CaptureEvidenceResult | null> => {
      const resp = await sendToExtension({
        type: 'CAPTURE_EVIDENCE',
        payload: { step_number: stepNumber },
      });
      if (resp.success && resp.data) {
        return resp.data as CaptureEvidenceResult;
      }
      return null;
    },
    [],
  );

  return {
    isAvailable,
    capabilities,
    checking,
    checkExtension,
    getPageState,
    captureEvidence,
  };
}
