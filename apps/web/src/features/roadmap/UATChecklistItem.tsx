/**
 * UATChecklistItem — Individual reviewable line item in a UAT package (FR-129).
 * FR-130 v2.1 — extended with BpProjectionView render path + EvidenceCaptureCell
 *               for observation/evidence capture (gates Pass per AC-32).
 */

import { useEffect, useState } from 'react';
import type { UatChecklistItemData } from '@/lib/api/uat-api';
import type { UatPriorCycle, UatPrototypeRef, BpReviewProjection } from '@/lib/api/uat-review-api';
import { BpProjectionView } from './BpProjectionView';
import { EvidenceCaptureCell } from './EvidenceCaptureCell';
import { uatReviewApi } from '@/lib/api/uat-review-api';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  PrototypePreviewInline,
  PriorCyclesView,
  ItemBadges,
  ScenarioDataView,
  DecisionButtons,
  FeedbackInput,
} from './UATChecklistItem-parts';

interface UATChecklistItemProps {
  item: UatChecklistItemData;
  onDecision: (itemId: string, decision: string, feedback?: string) => void;
  isUpdating: boolean;
  priorCycles?: UatPriorCycle[];
  prototype?: UatPrototypeRef | null;
  projection?: BpReviewProjection | null;
  featureId: string;
  onMetadataChange?: (
    itemId: string,
    m: { observation_text?: string; evidence_path?: string | null; ai_caption?: string | null }
  ) => void;
}

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
  projection,
  featureId,
  onMetadataChange,
}: UATChecklistItemProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState(item.feedback ?? '');
  const [observationText, setObservationText] = useState('');
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [localProjection, setLocalProjection] = useState<BpReviewProjection | null>(
    projection ?? null
  );
  const sourceBadge = SOURCE_BADGES[item.source];
  const isAdmin = useIsAdmin();
  const useProjectionRender =
    localProjection && localProjection.plain_english_statement.trim().length > 0;
  const evidenceRequired = localProjection?.evidence_required ?? false;
  const passBlocked =
    evidenceRequired && !evidencePath && (item.decision === 'pending' || item.decision === 'pass');

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const resp = await uatReviewApi.regenerateProjection(item.id);
      setLocalProjection(resp.data.bp_review_projection);
    } catch {
      // ignore — banner stays until user retries
    } finally {
      setIsRegenerating(false);
    }
  };

  // FR-130 v2.1 — push BP-side metadata up to UATPackageView's ref so the
  // batch submit picks it up at submit time.
  useEffect(() => {
    onMetadataChange?.(item.id, {
      observation_text: observationText,
      evidence_path: evidencePath,
      ai_caption: aiCaption,
    });
  }, [item.id, observationText, evidencePath, aiCaption, onMetadataChange]);

  const handleDecide = (d: string) => {
    if (d === 'pass' && passBlocked) return;
    onDecision(item.id, d, feedback || undefined);
  };

  return (
    <div
      className={`border rounded-lg p-3 ${item.decision !== 'pending' ? 'border-gray-200' : 'border-gray-300'}`}
    >
      <ItemBadges
        decision={item.decision}
        journeyPriority={item.journey_priority}
        sourceBadge={sourceBadge}
      />
      {useProjectionRender ? (
        <BpProjectionView
          projection={localProjection!}
          rawCriterion={item.content}
          isEngineerOrAdmin={isAdmin}
          onRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
        />
      ) : (
        <p className="text-sm text-gray-800 mb-2">{item.content}</p>
      )}
      <ScenarioDataView data={item.scenario_data} />
      {prototype && <PrototypePreviewInline prototype={prototype} />}
      {priorCycles && priorCycles.length > 0 && <PriorCyclesView cycles={priorCycles} />}

      <EvidenceCaptureCell
        decisionId={item.id}
        featureId={featureId}
        evidenceRequired={evidenceRequired}
        observationText={observationText}
        evidencePath={evidencePath}
        aiCaption={aiCaption}
        onObservationChange={setObservationText}
        onEvidenceChange={(path, caption) => {
          setEvidencePath(path);
          setAiCaption(caption);
        }}
        disabled={isUpdating}
      />

      <DecisionButtons
        currentDecision={item.decision}
        hasFeedback={!!item.feedback}
        isUpdating={isUpdating}
        onDecide={handleDecide}
        onToggleFeedback={() => setShowFeedback(!showFeedback)}
        passDisabled={passBlocked}
      />
      {passBlocked && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          This item needs evidence (a screenshot or capture) before you can mark it Pass.
        </p>
      )}
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
