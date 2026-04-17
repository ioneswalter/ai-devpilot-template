/**
 * GuidedStepCard - Displays a single guided test step with action,
 * target element, expected outcome, linked criterion, and verdict controls.
 */

import { useState } from 'react';
import { RemotePageCapture, SamePageCapture } from './GuidedStepEvidenceCapture';
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
  isOnAnotherPage?: boolean;
  onUploadScreenshot?: (dataUrl: string) => void;
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
  step, isActive, evidence, onMarkComplete, onCapture,
  capturing, extensionAvailable, captureError, lastCaptureSuccess,
  lastCapture, isOnAnotherPage = false, onUploadScreenshot, onClearEvidence,
}: GuidedStepCardProps) {
  const [verdict, setVerdict] = useState<StepVerdict | null>(evidence?.verdict ?? null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

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

          {step.target_element && (
            <p className="mt-0.5 text-xs text-blue-600 font-mono">
              Target: {step.target_element}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-600">
            <span className="font-medium text-gray-700">Expected: </span>
            {step.expected_outcome}
          </p>

          <p className="mt-1 text-[10px] text-purple-600 bg-purple-50 inline-block px-1.5 py-0.5 rounded">
            AC: {step.criterion_text}
          </p>

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
          {isOnAnotherPage ? (
            <RemotePageCapture
              extensionAvailable={extensionAvailable}
              onCapture={onCapture}
              capturing={capturing}
              captureError={captureError}
              lastCaptureSuccess={lastCaptureSuccess}
              lastCapture={lastCapture}
              onUploadScreenshot={onUploadScreenshot}
              onClearEvidence={onClearEvidence}
            />
          ) : (
            <SamePageCapture
              extensionAvailable={extensionAvailable}
              onCapture={onCapture}
              capturing={capturing}
              captureError={captureError}
              lastCaptureSuccess={lastCaptureSuccess}
              lastCapture={lastCapture}
            />
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

          {showNotes && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this step..."
              className="mt-2 w-full text-xs border rounded px-2 py-1.5 h-14 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
            />
          )}

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
