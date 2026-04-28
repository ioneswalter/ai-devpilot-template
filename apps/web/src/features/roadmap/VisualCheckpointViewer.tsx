/**
 * VisualCheckpointViewer — Displays visual assertion results from automated tests (FR-109 J2)
 * Shows checkpoint timeline with screenshot thumbnails, pass/fail badges, AI explanation.
 */

import { useState } from 'react';

interface CheckpointData {
  step_number: number;
  passed: boolean;
  cosmetic_only: boolean;
  explanation: string;
  screenshot_base64?: string;
  expected_outcome?: string;
  visual_elements_found?: string[];
  visual_elements_missing?: string[];
  confidence?: number;
}

interface VisualCheckpointViewerProps {
  checkpoints: CheckpointData[];
  onClose?: () => void;
}

export function VisualCheckpointViewer({ checkpoints, onClose }: VisualCheckpointViewerProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (checkpoints.length === 0) {
    return <div className="text-xs text-gray-500 italic p-2">No visual checkpoints recorded.</div>;
  }

  const passedCount = checkpoints.filter((c) => c.passed).length;
  const failedCount = checkpoints.filter((c) => !c.passed && !c.cosmetic_only).length;
  const cosmeticCount = checkpoints.filter((c) => !c.passed && c.cosmetic_only).length;

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden">
      <div className="bg-purple-50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-purple-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <h4 className="text-xs font-semibold text-purple-800">
            Visual Checkpoints ({passedCount}/{checkpoints.length} passed)
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <CheckpointSummaryBadges
            passed={passedCount}
            failed={failedCount}
            cosmetic={cosmeticCount}
          />
          {onClose && (
            <button onClick={onClose} className="text-xs text-purple-500 hover:text-purple-700">
              Close
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-purple-100">
        {checkpoints.map((cp) => (
          <CheckpointRow
            key={cp.step_number}
            checkpoint={cp}
            expanded={expandedStep === cp.step_number}
            onToggle={() =>
              setExpandedStep(expandedStep === cp.step_number ? null : cp.step_number)
            }
          />
        ))}
      </div>
    </div>
  );
}

function CheckpointSummaryBadges({
  passed,
  failed,
  cosmetic,
}: {
  passed: number;
  failed: number;
  cosmetic: number;
}) {
  return (
    <div className="flex gap-1">
      {passed > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">
          {passed} passed
        </span>
      )}
      {failed > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">
          {failed} failed
        </span>
      )}
      {cosmetic > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
          {cosmetic} cosmetic
        </span>
      )}
    </div>
  );
}

function CheckpointRow({
  checkpoint,
  expanded,
  onToggle,
}: {
  checkpoint: CheckpointData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor = checkpoint.passed
    ? 'text-green-600 bg-green-50'
    : checkpoint.cosmetic_only
      ? 'text-amber-600 bg-amber-50'
      : 'text-red-600 bg-red-50';

  const statusLabel = checkpoint.passed
    ? 'Passed'
    : checkpoint.cosmetic_only
      ? 'Cosmetic'
      : 'Failed';

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-purple-25 text-left"
      >
        <span className="text-xs font-mono text-gray-400 w-8">#{checkpoint.step_number}</span>
        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColor}`}>
          {statusLabel}
        </span>
        <span className="text-xs text-gray-700 flex-1 truncate">{checkpoint.explanation}</span>
        {checkpoint.confidence !== undefined && (
          <span className="text-[10px] text-gray-400">
            {Math.round(checkpoint.confidence * 100)}%
          </span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-11 space-y-2">
          {checkpoint.expected_outcome && (
            <div className="text-xs">
              <span className="font-medium text-gray-500">Expected: </span>
              <span className="text-gray-700">{checkpoint.expected_outcome}</span>
            </div>
          )}
          {checkpoint.screenshot_base64 && (
            <img
              src={checkpoint.screenshot_base64}
              alt={`Checkpoint step ${checkpoint.step_number}`}
              className="rounded border border-gray-200 max-h-40 object-contain"
            />
          )}
          {checkpoint.visual_elements_found && checkpoint.visual_elements_found.length > 0 && (
            <ElementList label="Found" items={checkpoint.visual_elements_found} color="green" />
          )}
          {checkpoint.visual_elements_missing && checkpoint.visual_elements_missing.length > 0 && (
            <ElementList label="Missing" items={checkpoint.visual_elements_missing} color="red" />
          )}
        </div>
      )}
    </div>
  );
}

function ElementList({
  label,
  items,
  color,
}: {
  label: string;
  items: string[];
  color: 'green' | 'red';
}) {
  const textClass = color === 'green' ? 'text-green-700' : 'text-red-700';
  const bgClass = color === 'green' ? 'bg-green-50' : 'bg-red-50';
  return (
    <div className="text-xs">
      <span className={`font-medium ${textClass}`}>{label}: </span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {items.map((item, i) => (
          <span key={i} className={`px-1.5 py-0.5 ${bgClass} ${textClass} rounded text-[10px]`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
