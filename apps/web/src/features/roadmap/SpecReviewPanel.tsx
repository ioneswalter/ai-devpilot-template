/**
 * SpecReviewPanel - Main review interface for proposed features (FR-091)
 * Shows original proposal alongside AI-generated enhancements
 */

import { useState, useEffect } from 'react';
import { useSpecReview } from './useSpecReview';
import { ReviewItemCard } from './ReviewItemCard';
import { ReviewApprovalBar } from './ReviewApprovalBar';
import { SpecArtifactsView } from './SpecArtifactsView';
import type { ReviewItem, ReviewItemType } from './spec-review-types';

interface SpecReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus?: string;
  onClose: () => void;
  onReviewComplete: () => void;
}

function groupItemsByType(items: ReviewItem[]): Record<string, ReviewItem[]> {
  const groups: Record<string, ReviewItem[]> = {};
  for (const item of items) {
    const key = item.item_type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function formatModelName(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return null;
}

const sectionOrder: ReviewItemType[] = ['criterion', 'test_case', 'edge_case', 'description'];
const sectionLabels: Record<string, string> = {
  criterion: 'Acceptance Criteria',
  test_case: 'Test Cases',
  edge_case: 'Edge Cases',
  description: 'Description Enhancements',
};

export function SpecReviewPanel({
  featureId,
  featureCode,
  featureTitle,
  featureStatus,
  onClose,
  onReviewComplete,
}: SpecReviewPanelProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  const spec = useSpecReview(featureId);
  const [newItemType, setNewItemType] = useState<ReviewItemType>('criterion');
  const [newItemContent, setNewItemContent] = useState('');
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [, setArtifactCount] = useState<number | null>(null);

  // Show loading while data is being fetched or component just mounted
  if (!ready || spec.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading spec review...</p>
      </div>
    );
  }

  // Gate states: features must progress through reviewed → approved before AI Review
  const needsProposalReview = featureStatus === 'proposed';
  const needsSpecGeneration = featureStatus === 'reviewed';

  const grouped = groupItemsByType(spec.items);

  function handleApprove() {
    spec.approveReview().then(() => {
      setShowSuccess('approved');
      setTimeout(() => onReviewComplete(), 1500);
    }).catch(() => {
      // Error is available via spec.approveError
    });
  }

  function handleSendBack(feedback: string) {
    spec.sendBack(feedback).then(() => {
      setShowSuccess('sent_back');
      setTimeout(() => onReviewComplete(), 1500);
    }).catch(() => {
      // Error is available via spec.sendBackError
    });
  }

  function handleAddItem() {
    if (newItemContent.trim()) {
      spec.addItem(newItemType, newItemContent.trim());
      setNewItemContent('');
    }
  }

  // No review yet — show start button
  if (!spec.isLoading && !spec.review) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
          </div>
          <p className="text-xs text-gray-500">Review spec artifacts, then start an AI review to enrich with suggestions.</p>
        </div>
        {/* Gate banners — proposed needs review, reviewed needs spec */}
        {needsProposalReview && (
          <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">Proposal Review Required</p>
              <p className="text-xs text-amber-700">Run <code className="font-mono bg-amber-100 px-1 rounded">\review-proposal {featureCode}</code> first, then <code className="font-mono bg-amber-100 px-1 rounded">\spec {featureCode}</code> to generate the specification.</p>
            </div>
          </div>
        )}
        {needsSpecGeneration && (
          <div className="px-4 py-3 border-b bg-violet-50 border-violet-200 flex items-center gap-3">
            <svg className="w-5 h-5 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-violet-800">Specification Required</p>
              <p className="text-xs text-violet-700">This feature has been reviewed. Run <code className="font-mono bg-violet-100 px-1 rounded">\spec {featureCode}</code> in Claude Code to generate the specification. AI Review becomes available after the spec is generated.</p>
            </div>
          </div>
        )}
        {/* AI Review action bar — only enabled when spec exists (approved or beyond) */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
          {spec.isStarting ? (
            <>
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900">AI is analyzing the proposal...</p>
                <p className="text-xs text-gray-500">Generating test cases, edge cases, and refined criteria. 15-30 seconds.</p>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => spec.startReview()}
                disabled={needsProposalReview || needsSpecGeneration}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 ${
                  needsProposalReview || needsSpecGeneration
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                Start AI Review
              </button>
              <p className="text-xs text-gray-500 flex-1">
                {needsProposalReview || needsSpecGeneration
                  ? 'AI Review is available after the spec is generated.'
                  : 'Enrich this proposal with AI-generated acceptance criteria, test cases, and edge cases.'}
              </p>
            </>
          )}
          {spec.startError && (
            <p className="text-xs text-red-500">{(spec.startError as Error).message}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <SpecArtifactsView featureId={featureId} onArtifactsLoaded={setArtifactCount} />
        </div>
        <div className="border-t p-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    );
  }

  const anyError = spec.approveError || spec.sendBackError || spec.updateError;

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
          showSuccess === 'approved' ? 'bg-green-100' : 'bg-amber-100'
        }`}>
          <svg className={`w-7 h-7 ${showSuccess === 'approved' ? 'text-green-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showSuccess === 'approved' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            )}
          </svg>
        </div>
        <h4 className="text-base font-semibold text-gray-900">
          {showSuccess === 'approved' ? 'Spec Approved' : 'Sent Back for Revision'}
        </h4>
        <p className="text-sm text-gray-500 text-center">
          {showSuccess === 'approved'
            ? `${spec.acceptedCount} items added to ${featureCode}`
            : `Feedback sent — ${featureCode} returned to ideation`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
          {spec.isReviewActive && spec.pendingCount > 0 && (
            <button
              onClick={() => spec.acceptAll()}
              disabled={spec.isUpdating}
              className="px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {spec.isUpdating ? 'Accepting...' : `Accept All (${spec.pendingCount})`}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Reviewer: {spec.review?.reviewer_name ?? 'Admin'}</span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${
            spec.review?.status === 'in_review' ? 'bg-blue-100 text-blue-700' :
            spec.review?.status === 'approved' ? 'bg-green-100 text-green-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {spec.review?.status?.replace('_', ' ')}
          </span>
          {(() => {
            const aiModel = (spec.review as unknown as Record<string, unknown>)?.ai_enrichment;
            const modelId = aiModel && typeof aiModel === 'object' && (aiModel as Record<string, unknown>).model;
            const label = typeof modelId === 'string' ? formatModelName(modelId) : null;
            return label ? (
              <span className="ml-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                {label}
              </span>
            ) : null;
          })()}
          {!spec.items.some(i => i.source === 'ai_generated') && spec.isReviewActive && (
            <span className="bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">
              Manual review mode
            </span>
          )}
        </div>
        {spec.review?.feedback && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Feedback:</strong> {spec.review.feedback}
          </div>
        )}
      </div>

      {/* Gate banners for incomplete workflow steps */}
      {needsProposalReview && (
        <div className="px-4 py-2.5 border-b bg-amber-50 border-amber-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Proposal not reviewed.</span> Run <code className="font-mono bg-amber-100 px-1 rounded">\review-proposal {featureCode}</code> before generating a spec.
          </p>
        </div>
      )}
      {needsSpecGeneration && (
        <div className="px-4 py-2.5 border-b bg-violet-50 border-violet-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-xs text-violet-800">
            <span className="font-semibold">Spec not generated.</span> Run <code className="font-mono bg-violet-100 px-1 rounded">\spec {featureCode}</code> to generate the specification.
          </p>
        </div>
      )}

      {/* Error banner */}
      {anyError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
          {(anyError as Error).message}
        </div>
      )}

      {/* Spec Artifacts — collapsed when review items are showing */}
      <SpecArtifactsView featureId={featureId} onArtifactsLoaded={setArtifactCount} defaultCollapsed />

      {/* Items grouped by type */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {sectionOrder.map(type => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;
          return (
            <div key={type}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {sectionLabels[type]} ({items.length})
              </h4>
              <div className={spec.isReviewActive ? 'space-y-2' : 'space-y-1'}>
                {items.map(item => (
                  <ReviewItemCard
                    key={item.id}
                    item={item}
                    isReviewActive={spec.isReviewActive}
                    onDecision={spec.updateItemDecision}
                    onComment={spec.addComment}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Add new item */}
        {spec.isReviewActive && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Add Item</h4>
            <div className="flex gap-2 mb-2">
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value as ReviewItemType)}
                className="text-xs border rounded px-2 py-1.5 bg-white"
              >
                <option value="criterion">Criterion</option>
                <option value="test_case">Test Case</option>
                <option value="edge_case">Edge Case</option>
              </select>
              <input
                type="text"
                value={newItemContent}
                onChange={(e) => setNewItemContent(e.target.value)}
                placeholder="Enter new item..."
                className="flex-1 text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
              />
              <button
                onClick={handleAddItem}
                disabled={!newItemContent.trim() || spec.isUpdating}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Review history */}
        {spec.history.length > 1 && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Previous Reviews
            </h4>
            <div className="space-y-1">
              {spec.history.slice(1).map(h => (
                <div key={h.id} className="text-xs text-gray-500 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    h.status === 'approved' ? 'bg-green-400' :
                    h.status === 'sent_back' ? 'bg-amber-400' : 'bg-gray-300'
                  }`} />
                  <span>{h.reviewer_name ?? 'Admin'}</span>
                  <span className="text-gray-400">{new Date(h.created_at).toLocaleDateString()}</span>
                  <span className="capitalize">{h.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Approval bar */}
      <ReviewApprovalBar
        pendingCount={spec.pendingCount}
        acceptedCount={spec.acceptedCount}
        rejectedCount={spec.rejectedCount}
        isReviewActive={spec.isReviewActive}
        isApproving={spec.isApproving}
        isSendingBack={spec.isSendingBack}
        onApprove={handleApprove}
        onSendBack={handleSendBack}
        onClose={onClose}
      />
    </div>
  );
}
