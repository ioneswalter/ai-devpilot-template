/**
 * UATReviewPanel — Main UAT review interface for Business Partners (FR-129)
 * Shows package header, spec version warning, checklist items, and approval bar.
 */

import { useCallback, useRef, useState } from 'react';
import { useUATPackage } from './useUATPackage';
import { useSubmitReview, useReviewContext } from '@/features/uat/hooks/useUatReview';
import { UatReviewerReassign } from './UatReviewerReassign';
import { UATCycleHistoryTab, aggregateCycleHistory } from './UATCycleHistoryTab';
import { UATTabBar } from './UATTabBar';
import { UATReviewTab } from './UATReviewTab';
import type {
  UatSubmitResult,
  UatPriorCycle,
  UatPrototypeRef,
  BpReviewProjection,
} from '@/lib/api/uat-review-api';
import {
  UATSuccessView,
  UATApprovalBar,
  NoPackageView,
  type ItemMetadata,
} from './UATReviewPanel-parts';

interface UATReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
}

export function UATReviewPanel({
  featureId,
  featureCode,
  featureTitle,
  featureStatus,
  onClose,
}: UATReviewPanelProps) {
  const uat = useUATPackage(featureId);
  const submitReview = useSubmitReview(featureId);
  const reviewContext = useReviewContext(featureId);
  const [showSuccess, setShowSuccess] = useState<UatSubmitResult | null>(null);
  const priorCyclesByItem = buildPriorCycleMap(reviewContext.data?.items);
  const prototypeByItem = buildPrototypeMap(reviewContext.data?.items);
  const projectionByItem = buildProjectionMap(reviewContext.data?.items);

  if (uat.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading UAT package...</p>
      </div>
    );
  }

  if (uat.error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 mb-2">Failed to load UAT package</p>
        <p className="text-xs text-gray-500">{(uat.error as Error).message}</p>
        <button
          onClick={onClose}
          className="mt-4 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>
    );
  }

  if (!uat.package) {
    return (
      <NoPackageView
        featureCode={featureCode}
        featureTitle={featureTitle}
        featureStatus={featureStatus}
        isGenerating={uat.isGenerating}
        generateError={uat.generateError}
        onGenerate={() => uat.generate().catch(() => {})}
        onClose={onClose}
      />
    );
  }

  if (showSuccess) {
    return <UATSuccessView result={showSuccess} featureCode={featureCode} onClose={onClose} />;
  }

  return (
    <UATPackageView
      uat={uat}
      submitReview={submitReview}
      featureCode={featureCode}
      featureTitle={featureTitle}
      priorCyclesByItem={priorCyclesByItem}
      prototypeByItem={prototypeByItem}
      projectionByItem={projectionByItem}
      currentCycle={reviewContext.data?.package.current_cycle ?? 1}
      reviewItems={reviewContext.data?.items ?? []}
      onClose={onClose}
      onSuccess={setShowSuccess}
    />
  );
}

function buildPriorCycleMap(
  items: ReadonlyArray<{ id: string; prior_cycles: UatPriorCycle[] }> | undefined
) {
  const map = new Map<string, UatPriorCycle[]>();
  for (const it of items ?? []) {
    if (it.prior_cycles && it.prior_cycles.length > 0) map.set(it.id, it.prior_cycles);
  }
  return map;
}

function buildPrototypeMap(
  items: ReadonlyArray<{ id: string; prototype: UatPrototypeRef | null }> | undefined
) {
  const map = new Map<string, UatPrototypeRef>();
  for (const it of items ?? []) {
    if (it.prototype) map.set(it.id, it.prototype);
  }
  return map;
}

// FR-130 v2.1 — extract bp_review_projection per item id for the BP-friendly render path.
function buildProjectionMap(
  items: ReadonlyArray<{ id: string; bp_review_projection: BpReviewProjection | null }> | undefined
) {
  const map = new Map<string, BpReviewProjection>();
  for (const it of items ?? []) {
    if (it.bp_review_projection) map.set(it.id, it.bp_review_projection);
  }
  return map;
}

function UATPackageView({
  uat,
  submitReview,
  featureCode,
  featureTitle,
  priorCyclesByItem,
  prototypeByItem,
  projectionByItem,
  currentCycle,
  reviewItems,
  onClose,
  onSuccess,
}: {
  uat: ReturnType<typeof useUATPackage>;
  submitReview: ReturnType<typeof useSubmitReview>;
  featureCode: string;
  featureTitle: string;
  priorCyclesByItem: Map<string, UatPriorCycle[]>;
  prototypeByItem: Map<string, UatPrototypeRef>;
  projectionByItem: Map<string, BpReviewProjection>;
  currentCycle: number;
  /** Items from /uat-get-review-context with prior_cycles attached — drives the Cycle history tab. */
  reviewItems: ReadonlyArray<import('@/lib/api/uat-review-api').UatReviewItem>;
  onClose: () => void;
  onSuccess: (r: UatSubmitResult) => void;
}) {
  const pkg = uat.package!;
  const isReviewable = pkg.status === 'in_review';
  const [tab, setTab] = useState<'review' | 'history'>('review');
  const historyCount = aggregateCycleHistory(reviewItems).length;
  // FR-130 v2.1 — collect per-item metadata (observation, evidence, AI caption)
  // emitted by EvidenceCaptureCell. Read at submit time by collectDecisions.
  const metadataRef = useRef<Map<string, ItemMetadata>>(new Map());
  const handleMetadataChange = useCallback((itemId: string, m: ItemMetadata) => {
    metadataRef.current.set(itemId, m);
  }, []);
  return (
    <div className="flex flex-col h-full">
      <UATHeader featureCode={featureCode} featureTitle={featureTitle} pkg={pkg} />
      <UATTabBar activeTab={tab} historyCount={historyCount} onChange={setTab} />
      {tab === 'review' && (
        <UATReviewTab
          uat={uat}
          submitReview={submitReview}
          currentCycle={currentCycle}
          priorCyclesByItem={priorCyclesByItem}
          prototypeByItem={prototypeByItem}
          projectionByItem={projectionByItem}
          featureId={uat.package!.feature_id}
          onMetadataChange={handleMetadataChange}
          isReviewable={isReviewable}
          approvalBar={
            <UATApprovalBar
              uat={uat}
              submitReview={submitReview}
              metadataRef={metadataRef}
              isReviewable={isReviewable}
              packageId={pkg.id}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          }
        />
      )}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto">
          <UATCycleHistoryTab items={reviewItems} />
        </div>
      )}
    </div>
  );
}

function UATHeader({
  featureCode,
  featureTitle,
  pkg,
}: {
  featureCode: string;
  featureTitle: string;
  pkg: NonNullable<ReturnType<typeof useUATPackage>['package']>;
}) {
  return (
    <div className="p-4 border-b bg-white">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs font-mono text-teal-600">{featureCode}</code>
        <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-medium ${pkg.status === 'approved' ? 'bg-green-100 text-green-700' : pkg.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}
        >
          UAT {pkg.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Generated: {new Date(pkg.created_at).toLocaleDateString()}</span>
        <span>
          Tests: {pkg.test_summary.passed}/{pkg.test_summary.total} passed
        </span>
        <span>{pkg.generated_by === 'auto' ? 'Auto-generated' : 'Manual'}</span>
      </div>
      <UatReviewerReassign
        packageId={pkg.id}
        currentReviewerName={pkg.reviewer_name ?? null}
        packageStatus={pkg.status}
      />
    </div>
  );
}
