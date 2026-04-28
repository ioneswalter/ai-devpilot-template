/**
 * ReviewItemCard - Displays a single review item with decision controls
 * Supports accept/reject/modify actions and inline comments (FR-091)
 */

import { useState } from 'react';
import type { ReviewItem, ReviewItemDecision } from './spec-review-types';

interface ReviewItemCardProps {
  item: ReviewItem;
  isReviewActive: boolean;
  onDecision: (itemId: string, decision: ReviewItemDecision, content?: string) => void;
  onComment: (itemId: string, comment: string) => void;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  criterion: { label: 'Criterion', color: 'bg-blue-100 text-blue-700' },
  test_case: { label: 'Test Case', color: 'bg-green-100 text-green-700' },
  edge_case: { label: 'Edge Case', color: 'bg-amber-100 text-amber-700' },
  description: { label: 'Description', color: 'bg-purple-100 text-purple-700' },
};

const sourceLabels: Record<string, { label: string; color: string }> = {
  ai_generated: { label: 'AI', color: 'bg-indigo-100 text-indigo-600' },
  original: { label: 'Original', color: 'bg-gray-100 text-gray-600' },
  manual: { label: 'Manual', color: 'bg-teal-100 text-teal-600' },
  speckit: { label: 'SpecKit', color: 'bg-orange-100 text-orange-600' },
};

const decisionStyles: Record<string, string> = {
  pending: 'border-gray-200',
  accepted: 'border-green-300 bg-green-50/50',
  rejected: 'border-red-200 bg-red-50/30 opacity-60',
  modified: 'border-blue-300 bg-blue-50/50',
};

export function ReviewItemCard({
  item,
  isReviewActive,
  onDecision,
  onComment,
}: ReviewItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  const typeBadge = typeLabels[item.item_type] ?? typeLabels.criterion;
  const sourceBadge = sourceLabels[item.source] ?? sourceLabels.original;

  function handleAccept() {
    onDecision(item.id, 'accepted');
  }

  function handleReject() {
    onDecision(item.id, 'rejected');
  }

  function handleSaveEdit() {
    if (editContent.trim() && editContent !== item.content) {
      onDecision(item.id, 'modified', editContent.trim());
    }
    setIsEditing(false);
  }

  function handleCancelEdit() {
    setEditContent(item.content);
    setIsEditing(false);
  }

  function handleAddComment() {
    if (commentText.trim()) {
      onComment(item.id, commentText.trim());
      setCommentText('');
    }
  }

  const comments = item.comments ?? [];

  const isDecided = item.decision !== 'pending';
  const isCompact = isDecided && !isReviewActive;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg transition-colors ${isCompact ? 'px-3 py-1.5 cursor-pointer hover:bg-gray-50/80' : 'p-3'} ${decisionStyles[item.decision]}`}
      onClick={isCompact ? () => setExpanded(!expanded) : undefined}
    >
      {/* Compact: single truncated line; Full: two rows */}
      {isCompact ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1 py-0.5 text-[10px] rounded shrink-0 ${sourceBadge.color}`}>
            {sourceBadge.label}
          </span>
          <p className={`text-xs text-gray-600 flex-1 min-w-0 ${expanded ? '' : 'truncate'}`}>
            {item.content}
          </p>
          <span
            className={`text-[10px] font-medium shrink-0 ${
              item.decision === 'accepted'
                ? 'text-green-600'
                : item.decision === 'rejected'
                  ? 'text-red-500'
                  : 'text-blue-600'
            }`}
          >
            {item.decision === 'accepted' ? '✓' : item.decision === 'rejected' ? '✗' : '~'}
          </span>
        </div>
      ) : (
        <>
          {/* Header: badges + decision indicator */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${typeBadge.color}`}>
              {typeBadge.label}
            </span>
            <span className={`px-1.5 py-0.5 text-xs rounded ${sourceBadge.color}`}>
              {sourceBadge.label}
            </span>
            {isDecided && (
              <span
                className={`ml-auto text-xs font-medium ${
                  item.decision === 'accepted'
                    ? 'text-green-600'
                    : item.decision === 'rejected'
                      ? 'text-red-500'
                      : 'text-blue-600'
                }`}
              >
                {item.decision.charAt(0).toUpperCase() + item.decision.slice(1)}
              </span>
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="mb-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full text-sm border rounded-md p-2 resize-y min-h-[60px] focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancelEdit();
                }}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSaveEdit}
                  className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 mb-2">{item.content}</p>
          )}
        </>
      )}

      {/* Original content diff (when modified) */}
      {!isCompact && item.decision === 'modified' && item.original_content && (
        <div className="text-xs text-gray-400 mb-2 line-through">{item.original_content}</div>
      )}

      {/* Action buttons */}
      {isReviewActive && !isEditing && !isCompact && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAccept}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              item.decision === 'accepted'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
            }`}
            aria-label={`Accept ${typeBadge.label}`}
          >
            Accept
          </button>
          <button
            onClick={handleReject}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              item.decision === 'rejected'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
            }`}
            aria-label={`Reject ${typeBadge.label}`}
          >
            Reject
          </button>
          <button
            onClick={() => {
              setEditContent(item.content);
              setIsEditing(true);
            }}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-blue-100 hover:text-blue-700 transition-colors"
            aria-label={`Edit ${typeBadge.label}`}
          >
            Edit
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {comments.length > 0 && <span>{comments.length}</span>}
          </button>
        </div>
      )}

      {/* Comments section */}
      {!isCompact && showComments && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {comments.length > 0 && (
            <div className="space-y-2 mb-2">
              {comments.map((comment, idx) => (
                <div key={idx} className="text-xs">
                  <span className="font-medium text-gray-700">{comment.user_name}</span>
                  <span className="text-gray-400 ml-1">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                  <p className="text-gray-600 mt-0.5">{comment.text}</p>
                </div>
              ))}
            </div>
          )}
          {isReviewActive && (
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 text-xs border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddComment();
                }}
              />
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="px-2 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
