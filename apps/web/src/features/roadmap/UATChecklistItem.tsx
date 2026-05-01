/**
 * UATChecklistItem — Individual reviewable line item in a UAT package (FR-129)
 */

import { useState } from 'react';
import type { UatChecklistItemData } from '@/lib/api/uat-api';
import type { UatPriorCycle, UatPrototypeRef } from '@/lib/api/uat-review-api';
import { PrototypeIframe } from '@/features/devpilot/PrototypeIframe';

interface UATChecklistItemProps {
  item: UatChecklistItemData;
  onDecision: (itemId: string, decision: string, feedback?: string) => void;
  isUpdating: boolean;
  priorCycles?: UatPriorCycle[];
  prototype?: UatPrototypeRef | null;
}

const DECISION_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  pass: 'bg-green-100 text-green-700',
  fail: 'bg-red-100 text-red-700',
  defer: 'bg-amber-100 text-amber-700',
};

const SOURCE_BADGES = {
  spec_criterion: null,
  ideation_happy_path: { label: 'Happy Path', color: 'bg-blue-100 text-blue-700' },
  ideation_edge_case: { label: 'Edge Case', color: 'bg-purple-100 text-purple-700' },
} as const;

export function UATChecklistItem({
  item,
  onDecision,
  isUpdating,
  priorCycles,
  prototype,
}: UATChecklistItemProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState(item.feedback ?? '');
  const sourceBadge = SOURCE_BADGES[item.source];

  return (
    <div
      className={`border rounded-lg p-3 ${item.decision !== 'pending' ? 'border-gray-200' : 'border-gray-300'}`}
    >
      <ItemBadges
        decision={item.decision}
        journeyPriority={item.journey_priority}
        sourceBadge={sourceBadge}
      />
      <p className="text-sm text-gray-800 mb-2">{item.content}</p>
      <ScenarioDataView data={item.scenario_data} />
      {prototype && <PrototypePreviewInline prototype={prototype} />}
      {priorCycles && priorCycles.length > 0 && <PriorCyclesView cycles={priorCycles} />}
      <DecisionButtons
        currentDecision={item.decision}
        hasFeedback={!!item.feedback}
        isUpdating={isUpdating}
        onDecide={(d) => onDecision(item.id, d, feedback || undefined)}
        onToggleFeedback={() => setShowFeedback(!showFeedback)}
      />
      {showFeedback && (
        <FeedbackInput
          feedback={feedback}
          onChange={setFeedback}
          onSave={() => {
            onDecision(item.id, item.decision, feedback);
            setShowFeedback(false);
          }}
          isUpdating={isUpdating}
        />
      )}
    </div>
  );
}

function PrototypePreviewInline({ prototype }: { prototype: UatPrototypeRef }) {
  const [open, setOpen] = useState(false);
  // FR-156: render via the shared PrototypeIframe so Spec Review and UAT Review
  // produce identical output (same CSP mode, same sandbox, same stale-content
  // fallback). Replaces the previous inline iframe + raw-text branching.
  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded p-2 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider hover:text-indigo-900"
      >
        {open ? '▼' : '▶'} Prototype: {prototype.prototype_type} v{prototype.version_number}
      </button>
      {open && prototype.content && (
        <div className="mt-2">
          <PrototypeIframe
            content={prototype.content}
            prototypeType={prototype.prototype_type}
            featureCode={`UAT-${prototype.id}`}
          />
        </div>
      )}
      {open && !prototype.content && (
        <p className="mt-1.5 text-xs text-indigo-600">
          No content available for this prototype version.
        </p>
      )}
    </div>
  );
}

function PriorCyclesView({ cycles }: { cycles: UatPriorCycle[] }) {
  const [open, setOpen] = useState(false);
  const latest = cycles[0];
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-2 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider hover:text-slate-900"
      >
        {open ? '▼' : '▶'} Previous review (cycle {latest.cycle_number}, {cycles.length} prior)
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {cycles.map((c) => (
            <div key={c.cycle_number} className="text-xs">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${
                  c.decision === 'pass'
                    ? 'bg-green-100 text-green-700'
                    : c.decision === 'fail'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                cycle {c.cycle_number} · {c.decision}
              </span>
              {c.feedback && <span className="text-gray-600 italic">— {c.feedback}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemBadges({
  decision,
  journeyPriority,
  sourceBadge,
}: {
  decision: string;
  journeyPriority: string | null;
  sourceBadge: { label: string; color: string } | null;
}) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${DECISION_STYLES[decision] ?? DECISION_STYLES.pending}`}
      >
        {decision === 'pending' ? '○' : decision === 'pass' ? '✓' : decision === 'fail' ? '✗' : '◐'}
      </span>
      {journeyPriority && (
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
          {journeyPriority}
        </span>
      )}
      {sourceBadge && (
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadge.color}`}
        >
          {sourceBadge.label}
        </span>
      )}
    </div>
  );
}

function ScenarioDataView({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return (
    <div className="bg-gray-50 rounded p-2 mb-2 text-xs text-gray-600">
      {data.steps != null && (
        <div>
          <strong>Steps:</strong> {String(data.steps)}
        </div>
      )}
      {data.expected_outcomes != null && (
        <div>
          <strong>Expected:</strong> {String(data.expected_outcomes)}
        </div>
      )}
    </div>
  );
}

function DecisionButtons({
  currentDecision,
  hasFeedback,
  isUpdating,
  onDecide,
  onToggleFeedback,
}: {
  currentDecision: string;
  hasFeedback: boolean;
  isUpdating: boolean;
  onDecide: (d: string) => void;
  onToggleFeedback: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {(['pass', 'fail', 'defer'] as const).map((d) => (
        <button
          key={d}
          onClick={() => onDecide(d)}
          disabled={isUpdating}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
            currentDecision === d
              ? d === 'pass'
                ? 'bg-green-600 text-white'
                : d === 'fail'
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {d === 'pass' ? 'Pass' : d === 'fail' ? 'Fail' : 'Defer'}
        </button>
      ))}
      <button
        onClick={onToggleFeedback}
        className="ml-auto text-xs text-gray-400 hover:text-gray-600"
      >
        {hasFeedback ? '💬' : '○'} Feedback
      </button>
    </div>
  );
}

function FeedbackInput({
  feedback,
  onChange,
  onSave,
  isUpdating,
}: {
  feedback: string;
  onChange: (v: string) => void;
  onSave: () => void;
  isUpdating: boolean;
}) {
  return (
    <div className="mt-2">
      <textarea
        value={feedback}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add feedback..."
        rows={2}
        className="w-full text-xs border rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
      />
      <button
        onClick={onSave}
        disabled={isUpdating}
        className="mt-1 px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Save Feedback
      </button>
    </div>
  );
}
