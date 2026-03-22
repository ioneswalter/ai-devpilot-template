/**
 * SpecReviewPanel - Main review interface for proposed features (FR-091)
 * Shows original proposal alongside AI-generated enhancements
 */

import { useState, useEffect } from 'react';
import { useSpecReview } from './useSpecReview';
import { ReviewItemCard } from './ReviewItemCard';
import { ReviewApprovalBar } from './ReviewApprovalBar';
import type { ReviewItem, ReviewItemType } from './spec-review-types';

interface SpecReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
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

  // Show loading while data is being fetched or component just mounted
  if (!ready || spec.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading spec review...</p>
      </div>
    );
  }

  const grouped = groupItemsByType(spec.items);

  function handleApprove() {
    spec.approveReview().then(() => {
      onReviewComplete();
    }).catch(() => {
      // Error is available via spec.approveError
    });
  }

  function handleSendBack(feedback: string) {
    spec.sendBack(feedback).then(() => {
      onReviewComplete();
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
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
          <p className="text-xs text-gray-500">Start a review to enrich this proposal with AI-generated suggestions.</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          {spec.isStarting ? (
            <div className="text-center max-w-xs">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <svg className="animate-spin w-16 h-16 text-indigo-200" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <svg className="absolute inset-0 w-16 h-16 text-indigo-500 p-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">AI is analyzing the proposal...</h4>
              <p className="text-xs text-gray-500">
                Generating test cases, edge cases, and refined acceptance criteria. This may take 15-30 seconds.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-indigo-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <button
                onClick={() => spec.startReview()}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Start AI Review
              </button>
              {spec.startError && (
                <p className="mt-2 text-xs text-red-500">{(spec.startError as Error).message}</p>
              )}
            </div>
          )}
        </div>
        <div className="border-t p-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    );
  }

  const anyError = spec.approveError || spec.sendBackError || spec.updateError;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
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

      {/* Error banner */}
      {anyError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
          {(anyError as Error).message}
        </div>
      )}

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
              <div className="space-y-2">
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
