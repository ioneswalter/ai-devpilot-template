/**
 * EvidenceViewer - Renders step-by-step evidence timeline from guided testing.
 * Shows screenshots, verdicts, criteria, console output, and network logs.
 */

import { useState } from 'react';
import type { GuidedTestEvidence, StepEvidence } from './guided-testing-types';

interface EvidenceViewerProps {
  evidence: GuidedTestEvidence;
  onClose: () => void;
}

function VerdictBadge({ verdict }: { verdict: StepEvidence['verdict'] }) {
  const cls =
    verdict === 'passed'
      ? 'bg-green-100 text-green-700'
      : verdict === 'failed'
        ? 'bg-red-100 text-red-700'
        : 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{verdict}</span>;
}

function StepDetail({ step }: { step: StepEvidence }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3">
      {/* Step header */}
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold">
          {step.step_number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <VerdictBadge verdict={step.verdict} />
            <span className="text-[10px] text-gray-400">
              {new Date(step.timestamp).toLocaleTimeString()}
            </span>
            {step.override && (
              <span className="text-[10px] text-amber-600 font-medium">Override</span>
            )}
          </div>
          <p className="text-xs font-medium text-gray-900">{step.action}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Expected: {step.expected_outcome}</p>
          <p className="text-[10px] text-purple-600 mt-0.5">AC: {step.criterion_text}</p>
        </div>
      </div>

      {/* Screenshot thumbnail */}
      {step.screenshot && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 w-full text-left">
          <img
            src={`data:image/png;base64,${step.screenshot}`}
            alt={`Step ${step.step_number} screenshot`}
            className={`rounded border ${expanded ? 'max-w-full' : 'max-h-24 object-cover w-full'}`}
          />
          <span className="text-[10px] text-blue-600 mt-0.5 inline-block">
            {expanded ? 'Collapse' : 'Click to expand'}
          </span>
        </button>
      )}

      {/* Expandable details */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Validation result */}
          {step.validation && (
            <DetailSection title="Validation">
              <p className="text-xs">
                {step.validation.matches_expected ? 'Matches expected' : 'Mismatch detected'}{' '}
                (confidence: {Math.round(step.validation.confidence * 100)}%)
              </p>
              <p className="text-xs text-gray-600">{step.validation.explanation}</p>
              {step.validation.mismatches.length > 0 && (
                <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                  {step.validation.mismatches.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </DetailSection>
          )}

          {/* Console output */}
          {step.console_output && step.console_output.length > 0 && (
            <DetailSection title={`Console (${step.console_output.length})`}>
              <div className="bg-gray-900 text-green-400 text-[10px] font-mono p-2 rounded max-h-32 overflow-y-auto">
                {step.console_output.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Network log */}
          {step.network_log && step.network_log.length > 0 && (
            <DetailSection title={`Network (${step.network_log.length})`}>
              <div className="space-y-1">
                {step.network_log.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span
                      className={`font-mono ${entry.status >= 400 ? 'text-red-600' : 'text-gray-600'}`}
                    >
                      {entry.status}
                    </span>
                    <span className="font-medium text-gray-500">{entry.method}</span>
                    <span className="text-gray-700 truncate">{entry.url}</span>
                    <span className="text-gray-400">{entry.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

export function EvidenceViewer({ evidence, onClose }: EvidenceViewerProps) {
  const passed = evidence.steps.filter((s) => s.verdict === 'passed').length;
  const failed = evidence.steps.filter((s) => s.verdict === 'failed').length;
  const skipped = evidence.steps.length - passed - failed;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b bg-white flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Guided Test Evidence</h4>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Session: {evidence.session_id.slice(0, 8)}... — {passed} passed, {failed} failed,{' '}
            {skipped} skipped
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
          Close
        </button>
      </div>

      {/* Step timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {evidence.steps.map((step) => (
          <StepDetail key={step.step_number} step={step} />
        ))}
      </div>
    </div>
  );
}
