/**
 * GuidedStepCard - Displays a single guided test step with action,
 * target element, expected outcome, linked criterion, and verdict controls.
 */

import { useState, useRef } from 'react';
import type { GuidedStep, StepEvidence, CaptureEvidenceResult } from './guided-testing-types';

type StepVerdict = 'passed' | 'failed' | 'skipped';

interface GuidedStepCardProps {
  step: GuidedStep;
  isActive: boolean;
  evidence: StepEvidence | null;
  onMarkComplete: (verdict: StepVerdict, notes: string) => void;
  onCapture: () => Promise<void>;
  capturing: boolean;
  extensionAvailable: boolean;
  captureError?: string | null;
  lastCaptureSuccess?: boolean;
  lastCapture?: CaptureEvidenceResult | null;
  /** True when this step is on another page (navigation step or follows one) */
  isOnAnotherPage?: boolean;
  /** Called when user uploads a screenshot file instead of using the extension */
  onUploadScreenshot?: (dataUrl: string) => void;
  /** Called when user removes uploaded/loaded evidence */
  onClearEvidence?: () => void;
}

const VERDICT_BUTTONS: { value: StepVerdict; label: string; active: string; inactive: string }[] = [
  {
    value: 'passed',
    label: 'Pass',
    active: 'bg-green-600 text-white',
    inactive: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
  },
  {
    value: 'failed',
    label: 'Fail',
    active: 'bg-red-600 text-white',
    inactive: 'text-red-600 hover:bg-red-50 border border-red-200',
  },
  {
    value: 'skipped',
    label: 'Skip',
    active: 'bg-gray-600 text-white',
    inactive: 'text-gray-600 hover:bg-gray-100 border border-gray-200',
  },
];

function StepBadge({ number, verdict }: { number: number; verdict: StepVerdict | null }) {
  const bg = verdict === 'passed'
    ? 'bg-green-500 text-white'
    : verdict === 'failed'
      ? 'bg-red-500 text-white'
      : verdict === 'skipped'
        ? 'bg-gray-400 text-white'
        : 'bg-blue-100 text-blue-700';

  return (
    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${bg}`}>
      {number}
    </span>
  );
}

export function GuidedStepCard({
  step,
  isActive,
  evidence,
  onMarkComplete,
  onCapture,
  capturing,
  extensionAvailable,
  captureError,
  lastCaptureSuccess,
  lastCapture,
  isOnAnotherPage = false,
  onUploadScreenshot,
  onClearEvidence,
}: GuidedStepCardProps) {
  const [verdict, setVerdict] = useState<StepVerdict | null>(evidence?.verdict ?? null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedPreview(dataUrl);
      onUploadScreenshot?.(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isCompleted = evidence !== null;
  const borderClass = isActive
    ? 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-200'
    : isCompleted
      ? evidence.verdict === 'passed'
        ? 'border-green-200 bg-green-50/30'
        : evidence.verdict === 'failed'
          ? 'border-red-200 bg-red-50/30'
          : 'border-gray-200 bg-gray-50/30'
      : 'border-gray-100';

  const handleSubmit = () => {
    if (!verdict) return;
    onMarkComplete(verdict, notes);
  };

  return (
    <div className={`border rounded-lg p-3 transition-colors ${borderClass}`}>
      {/* Header: step number + action */}
      <div className="flex items-start gap-2">
        <StepBadge number={step.step_number} verdict={isCompleted ? evidence.verdict : null} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{step.action}</p>

          {/* Target element hint */}
          {step.target_element && (
            <p className="mt-0.5 text-xs text-blue-600 font-mono">
              Target: {step.target_element}
            </p>
          )}

          {/* Expected outcome */}
          <p className="mt-1 text-xs text-gray-600">
            <span className="font-medium text-gray-700">Expected: </span>
            {step.expected_outcome}
          </p>

          {/* Linked criterion */}
          <p className="mt-1 text-[10px] text-purple-600 bg-purple-50 inline-block px-1.5 py-0.5 rounded">
            AC: {step.criterion_text}
          </p>

          {/* Navigation button — opens test page in new tab */}
          {step.requires_navigation && (
            <button
              onClick={() => window.open(step.requires_navigation, '_blank')}
              className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded hover:bg-amber-100 transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              Open {step.requires_navigation}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Controls (only when active and not yet completed) */}
      {isActive && !isCompleted && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          {/* Evidence capture — for steps on another page, offer plugin load OR screenshot upload */}
          {isOnAnotherPage && (
            <div className="mb-2">
              <p className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5 mb-1.5">
                Capture evidence using the extension on the test page, or upload a screenshot.
              </p>
              <div className="flex gap-1.5">
                {extensionAvailable && (
                  <button
                    onClick={onCapture}
                    disabled={capturing}
                    className="flex-1 text-xs py-1.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 transition-colors"
                  >
                    {capturing ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : 'Load from Extension'}
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 text-xs py-1.5 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Upload Screenshot
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              {captureError && (
                <p className="mt-1 text-[10px] text-red-600">{captureError}</p>
              )}
              {lastCaptureSuccess && !capturing && (
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => setShowPreview((v) => !v)}
                    className="text-[10px] text-green-600 hover:text-green-700 underline"
                  >
                    {showPreview ? 'Hide preview' : 'Evidence loaded — click to preview'}
                  </button>
                  <button
                    onClick={() => { setUploadedPreview(null); onClearEvidence?.(); }}
                    className="text-[10px] text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
              {showPreview && lastCapture && (
                <div className="mt-2 space-y-1.5 border border-green-200 rounded p-2 bg-green-50/50">
                  {lastCapture.screenshot && (
                    <img src={lastCapture.screenshot} alt="Captured screenshot" className="w-full rounded border border-gray-200" />
                  )}
                </div>
              )}
              {uploadedPreview && !lastCaptureSuccess && (
                <div className="mt-2 border border-blue-200 rounded p-2 bg-blue-50/50">
                  <img src={uploadedPreview} alt="Uploaded screenshot" className="w-full rounded border border-gray-200" />
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-[10px] text-blue-600">Screenshot uploaded</p>
                    <button
                      onClick={() => { setUploadedPreview(null); onClearEvidence?.(); }}
                      className="text-[10px] text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Capture button — only for steps on the same page */}
          {extensionAvailable && !isOnAnotherPage && (
            <div className="mb-2">
              <button
                onClick={onCapture}
                disabled={capturing}
                className="w-full text-xs py-1.5 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                {capturing ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Capturing...
                  </span>
                ) : 'Capture Evidence'}
              </button>
              {captureError && (
                <p className="mt-1 text-[10px] text-red-600">{captureError}</p>
              )}
              {lastCaptureSuccess && !capturing && (
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className="mt-1 text-[10px] text-green-600 hover:text-green-700 underline"
                >
                  {showPreview ? 'Hide preview' : 'Evidence captured — click to preview'}
                </button>
              )}
              {showPreview && lastCapture && (
                <div className="mt-2 space-y-1.5 border border-green-200 rounded p-2 bg-green-50/50">
                  {lastCapture.screenshot && (
                    <img
                      src={lastCapture.screenshot}
                      alt="Captured screenshot"
                      className="w-full rounded border border-gray-200"
                    />
                  )}
                  {lastCapture.console_output?.length > 0 && (
                    <div className="text-[10px]">
                      <span className="font-medium text-gray-700">Console: </span>
                      <span className="text-gray-500">{lastCapture.console_output.length} entries</span>
                    </div>
                  )}
                  {lastCapture.network_log?.length > 0 && (
                    <div className="text-[10px]">
                      <span className="font-medium text-gray-700">Network: </span>
                      <span className="text-gray-500">{lastCapture.network_log.length} requests</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Verdict buttons */}
          <div className="flex items-center gap-1.5">
            {VERDICT_BUTTONS.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setVerdict(btn.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  verdict === btn.value ? btn.active : btn.inactive
                }`}
              >
                {btn.label}
              </button>
            ))}

            {!showNotes && (
              <button
                onClick={() => setShowNotes(true)}
                className="ml-auto text-xs text-blue-600 hover:text-blue-700"
              >
                + Notes
              </button>
            )}
          </div>

          {/* Notes */}
          {showNotes && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this step..."
              className="mt-2 w-full text-xs border rounded px-2 py-1.5 h-14 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
            />
          )}

          {/* Submit button */}
          {verdict && (
            <button
              onClick={handleSubmit}
              className="mt-2 w-full text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              Confirm &amp; Next
            </button>
          )}
        </div>
      )}

      {/* Completed summary */}
      {isCompleted && (
        <div className="mt-2 text-[10px] text-gray-500">
          Completed at {new Date(evidence.timestamp).toLocaleTimeString()}
          {evidence.screenshot && ' — screenshot captured'}
        </div>
      )}
    </div>
  );
}
