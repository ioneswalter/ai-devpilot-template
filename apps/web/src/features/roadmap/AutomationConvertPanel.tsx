/**
 * AutomationConvertPanel — Convert guided test to automated script (FR-109 J3)
 * Shows "Convert to Automated" button on test cases with guided evidence.
 */

import { useState } from 'react';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { ConvertManualResult } from './automation-types';

interface AutomationConvertPanelProps {
  testCaseId: string;
  hasGuidedEvidence: boolean;
  isAutomated: boolean;
  onConverted?: (result: ConvertManualResult) => void;
}

export function AutomationConvertPanel({
  testCaseId,
  hasGuidedEvidence,
  isAutomated,
  onConverted,
}: AutomationConvertPanelProps) {
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertManualResult | null>(null);
  const [alreadyAutomated, setAlreadyAutomated] = useState(false);

  if (isAutomated || alreadyAutomated) {
    return (
      <div className="text-xs text-green-600 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Automated
      </div>
    );
  }

  if (!hasGuidedEvidence) {
    return (
      <div className="text-xs text-gray-400 italic">
        Complete guided testing (AI Guide) first to enable conversion
      </div>
    );
  }

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const data = await testAutomationApi.convertManual(testCaseId);
      setResult(data);
      onConverted?.(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      // 409 = script already exists — show as "already automated" rather than error
      if (message.toLowerCase().includes('already') && message.toLowerCase().includes('active')) {
        setAlreadyAutomated(true);
      } else {
        setError(message);
      }
    } finally {
      setConverting(false);
    }
  };

  if (result) {
    return (
      <div className="text-xs bg-green-50 border border-green-200 rounded p-2 space-y-1">
        <div className="flex items-center gap-1 text-green-700 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Converted to automated ({result.step_count} steps)
        </div>
        <p className="text-green-600">{result.validation_note}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleConvert}
        disabled={converting}
        className="px-2 py-1 text-xs font-medium text-indigo-600 border border-indigo-300 rounded hover:bg-indigo-50 disabled:opacity-50"
      >
        {converting ? 'Converting...' : 'Convert to Automated'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
