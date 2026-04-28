/**
 * SpecReviewPanel - Main review interface for proposed features (FR-091)
 * Shows original proposal alongside AI-generated enhancements
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSpecReview } from './useSpecReview';
import { ReviewItemCard } from './ReviewItemCard';
import { ReviewApprovalBar } from './ReviewApprovalBar';
import { SpecArtifactsView } from './SpecArtifactsView';
import { SpecReviewStartView } from './SpecReviewStartView';
import type { ReviewItem, ReviewItemType } from './spec-review-types';
import { CopyableCommand } from '@/components/ui/CopyableCommand';
import { usePrototypeAttachment } from '@/features/devpilot/hooks/usePrototypeAttachment';
import { PrototypePanel } from './PrototypePanel';

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
    if (!groups[item.item_type]) groups[item.item_type] = [];
    groups[item.item_type].push(item);
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
  // FR-089 v1.1 J3 (C2): inline-render the prototype attachment if one exists.
  const prototypeAttachment = usePrototypeAttachment(featureId);
  const [newItemType, setNewItemType] = useState<ReviewItemType>('criterion');
  const [newItemContent, setNewItemContent] = useState('');
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [, setArtifactCount] = useState<number | null>(null);

  // FR-149 v1.1: Detect versioned feature needing new spec review
  const versionQuery = useQuery({
    queryKey: ['feature-version-spec', featureId],
    queryFn: async () => {
      const { data: versions } = await supabase
        .from('feature_versions')
        .select('id, version_label, version_number, superseded_by')
        .eq('feature_id', featureId)
        .order('version_number', { ascending: false });
      if (!versions || versions.length === 0) return null;
      const current = versions.find((v) => v.superseded_by === null);
      if (!current || current.version_number <= 1) return null;
      return {
        currentLabel: current.version_label,
        priorLabel: versions.find((v) => v.superseded_by !== null)?.version_label ?? 'v1.0',
      };
    },
    staleTime: 30_000,
  });
  const versionInfo = versionQuery.data;

  if (!ready || spec.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading spec review...</p>
      </div>
    );
  }

  const needsProposalReview = featureStatus === 'proposed';
  const needsSpecGeneration = featureStatus === 'reviewed' && !spec.review;
  const grouped = groupItemsByType(spec.items);

  if (!spec.isLoading && !spec.review) {
    return (
      <SpecReviewStartView
        featureId={featureId}
        featureCode={featureCode}
        featureTitle={featureTitle}
        needsProposalReview={needsProposalReview}
        needsSpecGeneration={needsSpecGeneration}
        isStarting={spec.isStarting}
        startError={spec.startError}
        onStartReview={() => spec.startReview()}
        onArtifactsLoaded={setArtifactCount}
        onClose={onClose}
      />
    );
  }

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center ${showSuccess === 'approved' ? 'bg-green-100' : 'bg-amber-100'}`}
        >
          <svg
            className={`w-7 h-7 ${showSuccess === 'approved' ? 'text-green-600' : 'text-amber-600'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {showSuccess === 'approved' ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
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

  const anyError = spec.approveError || spec.sendBackError || spec.updateError;

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
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${spec.review?.status === 'in_review' ? 'bg-blue-100 text-blue-700' : spec.review?.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
          >
            {spec.review?.status?.replace('_', ' ')}
          </span>
          {(() => {
            const aiModel = (spec.review as unknown as Record<string, unknown>)?.ai_enrichment;
            const modelId =
              aiModel && typeof aiModel === 'object' && (aiModel as Record<string, unknown>).model;
            const label = typeof modelId === 'string' ? formatModelName(modelId) : null;
            return label ? (
              <span className="ml-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                {label}
              </span>
            ) : null;
          })()}
          {!spec.items.some((i) => i.source === 'ai_generated') && spec.isReviewActive && (
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

      {versionInfo && featureStatus === 'proposed' && (
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-purple-100 text-purple-700">
              {versionInfo.currentLabel}
            </span>
            <span className="text-sm font-medium text-purple-900">
              New version needs proposal review
            </span>
          </div>
          <p className="text-xs text-purple-700">
            The spec below is from {versionInfo.priorLabel}. Run{' '}
            <CopyableCommand
              command={`\\review-proposal ${featureCode}`}
              className="bg-purple-100"
            />{' '}
            in Claude Code to review the {versionInfo.currentLabel} proposal.
          </p>
        </div>
      )}
      {versionInfo && spec.review?.status === 'approved' && featureStatus === 'reviewed' && (
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-purple-100 text-purple-700">
              {versionInfo.currentLabel}
            </span>
            <span className="text-sm font-medium text-purple-900">
              New version needs specification
            </span>
          </div>
          <p className="text-xs text-purple-700">
            The spec below is from {versionInfo.priorLabel} (approved). Run{' '}
            <CopyableCommand command={`\\spec ${featureCode}`} className="bg-purple-100" /> in
            Claude Code to generate spec review items for the {versionInfo.currentLabel} delta
            criteria.
          </p>
        </div>
      )}

      {anyError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
          {(anyError as Error).message}
        </div>
      )}
      <SpecArtifactsView
        featureId={featureId}
        onArtifactsLoaded={setArtifactCount}
        defaultCollapsed
      />
      <PrototypePanel featureCode={featureCode} attachment={prototypeAttachment} />

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {sectionOrder.map((type) => {
          const items = grouped[type];
          if (!items?.length) return null;
          return (
            <div key={type}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {sectionLabels[type]} ({items.length})
              </h4>
              <div className={spec.isReviewActive ? 'space-y-2' : 'space-y-1'}>
                {items.map((item) => (
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

        {spec.isReviewActive && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Add Item
            </h4>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemContent.trim()) {
                    spec.addItem(newItemType, newItemContent.trim());
                    setNewItemContent('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newItemContent.trim()) {
                    spec.addItem(newItemType, newItemContent.trim());
                    setNewItemContent('');
                  }
                }}
                disabled={!newItemContent.trim() || spec.isUpdating}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {spec.history.length > 1 && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Previous Reviews
            </h4>
            <div className="space-y-1">
              {spec.history.slice(1).map((h) => (
                <div key={h.id} className="text-xs text-gray-500 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${h.status === 'approved' ? 'bg-green-400' : h.status === 'sent_back' ? 'bg-amber-400' : 'bg-gray-300'}`}
                  />
                  <span>{h.reviewer_name ?? 'Admin'}</span>
                  <span className="text-gray-400">
                    {new Date(h.created_at).toLocaleDateString()}
                  </span>
                  <span className="capitalize">{(h.status ?? 'unknown').replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ReviewApprovalBar
        pendingCount={spec.pendingCount}
        acceptedCount={spec.acceptedCount}
        rejectedCount={spec.rejectedCount}
        isReviewActive={spec.isReviewActive}
        isApproving={spec.isApproving}
        isSendingBack={spec.isSendingBack}
        onApprove={() =>
          spec
            .approveReview()
            .then(() => {
              setShowSuccess('approved');
              setTimeout(() => onReviewComplete(), 1500);
            })
            .catch(() => {})
        }
        onSendBack={(fb) =>
          spec
            .sendBack(fb)
            .then(() => {
              setShowSuccess('sent_back');
              setTimeout(() => onReviewComplete(), 1500);
            })
            .catch(() => {})
        }
        onClose={onClose}
      />
    </div>
  );
}
