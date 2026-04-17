/**
 * GuidedTestingPanelWidgets — Sub-components extracted from GuidedTestingPanel.
 */

import type { ValidationResult } from './guided-testing-types';

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div
        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

export function TestDataPrompt({
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
          {generating ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </span>
          ) : 'Generate Test Data'}
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

export function ExtensionWarning() {
  return (
    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
      <span className="font-medium">Browser extension not detected.</span>{' '}
      Evidence will not be auto-captured. Install the OwnYourGig extension for full co-pilot features.
    </div>
  );
}

interface ValidationWarningProps {
  validationWarning: ValidationResult;
  pendingVerdict: { verdict: 'passed' | 'failed' | 'skipped'; notes: string };
  onOverride: () => void;
  onCancel: () => void;
}

export function ValidationWarningPanel({
  validationWarning,
  pendingVerdict: _pendingVerdict,
  onOverride,
  onCancel,
}: ValidationWarningProps) {
  return (
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
          onClick={onOverride}
          className="px-2.5 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 font-medium"
        >
          Override — Mark as Passed
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
