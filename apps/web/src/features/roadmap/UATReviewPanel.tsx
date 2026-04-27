/**
 * UATReviewPanel — Main UAT review interface for Business Partners (FR-129)
 * Shows package header, spec version warning, checklist items, and approval bar.
 */

import { useState } from 'react';
import { useUATPackage } from './useUATPackage';
import { useSubmitReview, useReviewContext } from '@/features/uat/hooks/useUatReview';
import { UatReviewerReassign } from './UatReviewerReassign';
import { UATCycleHistoryTab, aggregateCycleHistory } from './UATCycleHistoryTab';
import { UATTabBar } from './UATTabBar';
import { UATReviewTab } from './UATReviewTab';
import type { UatSubmitDecision, UatSubmitResult, UatPriorCycle, UatPrototypeRef } from '@/lib/api/uat-review-api';

interface UATReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
}

export function UATReviewPanel({
  featureId, featureCode, featureTitle, featureStatus, onClose,
}: UATReviewPanelProps) {
  const uat = useUATPackage(featureId);
  const submitReview = useSubmitReview(featureId);
  const reviewContext = useReviewContext(featureId);
  const [showSuccess, setShowSuccess] = useState<UatSubmitResult | null>(null);
  const priorCyclesByItem = buildPriorCycleMap(reviewContext.data?.items);
  const prototypeByItem = buildPrototypeMap(reviewContext.data?.items);

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
        <button onClick={onClose} className="mt-4 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    );
  }

  if (!uat.package) {
    return <NoPackageView featureCode={featureCode} featureTitle={featureTitle} featureStatus={featureStatus}
      isGenerating={uat.isGenerating} generateError={uat.generateError}
      onGenerate={() => uat.generate().catch(() => {})} onClose={onClose} />;
  }

  if (showSuccess) {
    return <UATSuccessView result={showSuccess} featureCode={featureCode} />;
  }

  return <UATPackageView uat={uat} submitReview={submitReview} featureCode={featureCode} featureTitle={featureTitle}
    priorCyclesByItem={priorCyclesByItem}
    prototypeByItem={prototypeByItem}
    currentCycle={reviewContext.data?.package.current_cycle ?? 1}
    reviewItems={reviewContext.data?.items ?? []}
    onClose={onClose} onSuccess={setShowSuccess} />;
}

function buildPriorCycleMap(items: ReadonlyArray<{ id: string; prior_cycles: UatPriorCycle[] }> | undefined) {
  const map = new Map<string, UatPriorCycle[]>();
  for (const it of items ?? []) {
    if (it.prior_cycles && it.prior_cycles.length > 0) map.set(it.id, it.prior_cycles);
  }
  return map;
}

function buildPrototypeMap(items: ReadonlyArray<{ id: string; prototype: UatPrototypeRef | null }> | undefined) {
  const map = new Map<string, UatPrototypeRef>();
  for (const it of items ?? []) {
    if (it.prototype) map.set(it.id, it.prototype);
  }
  return map;
}

function UATSuccessView({ result, featureCode }: { result: UatSubmitResult; featureCode: string }) {
  const status = result.package.status;
  const fixTaskCount = result.fix_cycle_tasks_created.length;
  const isApproved = status === 'approved';
  const headline = isApproved ? 'UAT Approved' : status === 'rejected' ? 'UAT Rejected' : 'Review Submitted';
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isApproved ? 'bg-green-100' : status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'}`}>
        <span className="text-2xl">{isApproved ? '✓' : status === 'rejected' ? '✗' : '◐'}</span>
      </div>
      <h4 className="text-base font-semibold text-gray-900">{headline}</h4>
      <p className="text-sm text-gray-500">{featureCode} — cycle {result.cycle_number} — {result.summary.pass} passed, {result.summary.fail} failed, {result.summary.defer} deferred</p>
      {fixTaskCount > 0 && (
        <p className="text-xs text-gray-500">{fixTaskCount} fix-cycle task{fixTaskCount === 1 ? '' : 's'} dispatched to engineering.</p>
      )}
    </div>
  );
}

function UATPackageView({ uat, submitReview, featureCode, featureTitle, priorCyclesByItem, prototypeByItem, currentCycle, reviewItems, onClose, onSuccess }: {
  uat: ReturnType<typeof useUATPackage>;
  submitReview: ReturnType<typeof useSubmitReview>;
  featureCode: string; featureTitle: string;
  priorCyclesByItem: Map<string, UatPriorCycle[]>;
  prototypeByItem: Map<string, UatPrototypeRef>;
  currentCycle: number;
  /** Items from /uat-get-review-context with prior_cycles attached — drives the Cycle history tab. */
  reviewItems: ReadonlyArray<import('@/lib/api/uat-review-api').UatReviewItem>;
  onClose: () => void; onSuccess: (r: UatSubmitResult) => void;
}) {
  const pkg = uat.package!;
  const isReviewable = pkg.status === 'in_review';
  const [tab, setTab] = useState<'review' | 'history'>('review');
  const historyCount = aggregateCycleHistory(reviewItems).length;
  return (
    <div className="flex flex-col h-full">
      <UATHeader featureCode={featureCode} featureTitle={featureTitle} pkg={pkg} />
      <UATTabBar activeTab={tab} historyCount={historyCount} onChange={setTab} />
      {tab === 'review' && (
        <UATReviewTab
          uat={uat} submitReview={submitReview}
          currentCycle={currentCycle} priorCyclesByItem={priorCyclesByItem}
          prototypeByItem={prototypeByItem} isReviewable={isReviewable}
          approvalBar={
            <UATApprovalBar uat={uat} submitReview={submitReview} isReviewable={isReviewable}
              packageId={pkg.id} onClose={onClose} onSuccess={onSuccess} />
          }
        />
      )}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto"><UATCycleHistoryTab items={reviewItems} /></div>
      )}
    </div>
  );
}

function UATHeader({ featureCode, featureTitle, pkg }: { featureCode: string; featureTitle: string; pkg: NonNullable<ReturnType<typeof useUATPackage>['package']> }) {
  return (
    <div className="p-4 border-b bg-white">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs font-mono text-teal-600">{featureCode}</code>
        <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${pkg.status === 'approved' ? 'bg-green-100 text-green-700' : pkg.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
          UAT {pkg.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Generated: {new Date(pkg.created_at).toLocaleDateString()}</span>
        <span>Tests: {pkg.test_summary.passed}/{pkg.test_summary.total} passed</span>
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

function UATApprovalBar({ uat, submitReview, isReviewable, packageId, onClose, onSuccess }: {
  uat: ReturnType<typeof useUATPackage>;
  submitReview: ReturnType<typeof useSubmitReview>;
  isReviewable: boolean; packageId: string;
  onClose: () => void; onSuccess: (r: UatSubmitResult) => void;
}) {
  const decisions = collectDecisions(uat.items);
  const canSubmit = isReviewable && uat.pendingCount === 0 && decisions.invalidFeedback.length === 0;
  const submitLabel = decisions.hasFails ? 'Submit (Reject + Fix)' : decisions.hasOnlyDefers ? 'Submit Deferrals' : 'Approve UAT';
  const submitClass = decisions.hasFails ? 'bg-red-600 hover:bg-red-700' : decisions.hasOnlyDefers ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700';
  const onSubmitClick = () => submitReview.mutate(
    { package_id: packageId, decisions: decisions.payload },
    { onSuccess },
  );
  return (
    <div className="border-t bg-white">
      {decisions.invalidFeedback.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 text-xs text-amber-700 border-b border-amber-100">
          {decisions.invalidFeedback.length} item(s) marked fail/defer need feedback before submit.
        </div>
      )}
      <div className="p-3 flex items-center justify-between">
        <UATCounts uat={uat} />
        <div className="flex items-center gap-2">
          {isReviewable && (
            <button onClick={onSubmitClick} disabled={!canSubmit || submitReview.isPending}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50 ${submitClass}`}>
              {submitReview.isPending ? 'Submitting...' : submitLabel}
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
      {submitReview.error && <div className="px-4 py-2 bg-red-50 text-xs text-red-600">{submitReview.error.message}</div>}
    </div>
  );
}

function UATCounts({ uat }: { uat: ReturnType<typeof useUATPackage> }) {
  return (
    <div className="text-xs text-gray-500 space-x-3">
      <span>{uat.pendingCount} pending</span>
      <span className="text-green-600">{uat.passedCount} passed</span>
      {uat.failedCount > 0 && <span className="text-red-600">{uat.failedCount} failed</span>}
      {uat.deferredCount > 0 && <span className="text-amber-600">{uat.deferredCount} deferred</span>}
    </div>
  );
}

function collectDecisions(items: ReturnType<typeof useUATPackage>['items']) {
  const payload: UatSubmitDecision[] = [];
  const invalidFeedback: string[] = [];
  let hasFails = false;
  let hasDefers = false;
  let hasPasses = false;
  for (const item of items) {
    const decision = item.decision;
    if (decision === 'pending' || !decision) continue;
    if (decision === 'fail') hasFails = true;
    else if (decision === 'defer') hasDefers = true;
    else if (decision === 'pass') hasPasses = true;
    if ((decision === 'fail' || decision === 'defer') && !item.feedback?.trim()) {
      invalidFeedback.push(item.id);
    }
    payload.push({
      checklist_item_id: item.id,
      decision: decision as UatSubmitDecision['decision'],
      feedback: item.feedback ?? undefined,
    });
  }
  return { payload, invalidFeedback, hasFails, hasOnlyDefers: hasDefers && !hasFails && !hasPasses };
}

/** Shown when no UAT package exists yet */
function NoPackageView({ featureCode, featureTitle, featureStatus, isGenerating, generateError, onGenerate, onClose }: {
  featureCode: string; featureTitle: string; featureStatus: string;
  isGenerating: boolean; generateError: Error | null;
  onGenerate: () => void; onClose: () => void;
}) {
  const canGenerate = featureStatus === 'in_testing' || featureStatus === 'released';

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-teal-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">No UAT package has been generated yet.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-sm text-gray-500 mb-4">
            {canGenerate
              ? 'Generate a UAT package to create an acceptance criteria checklist for Business Partner review.'
              : 'UAT packages can only be generated for features in testing (all tests must pass).'}
          </p>
          {canGenerate && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate UAT Package'}
            </button>
          )}
          {generateError && (
            <p className="mt-2 text-xs text-red-600">{generateError.message}</p>
          )}
        </div>
      </div>
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    </div>
  );
}
