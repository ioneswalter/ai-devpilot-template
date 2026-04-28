/**
 * ReviewApprovalBar - Sticky bottom bar with approve/send-back actions (FR-091)
 */

import { useState } from 'react';

interface ReviewApprovalBarProps {
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  isReviewActive: boolean;
  isApproving: boolean;
  isSendingBack: boolean;
  onApprove: () => void;
  onSendBack: (feedback: string) => void;
  onClose: () => void;
}

export function ReviewApprovalBar({
  pendingCount,
  acceptedCount,
  rejectedCount,
  isReviewActive,
  isApproving,
  isSendingBack,
  onApprove,
  onSendBack,
  onClose,
}: ReviewApprovalBarProps) {
  const [showSendBack, setShowSendBack] = useState(false);
  const [feedback, setFeedback] = useState('');
  const canApprove = isReviewActive && acceptedCount > 0 && pendingCount === 0;
  const totalDecided = acceptedCount + rejectedCount;

  function handleSendBack() {
    if (feedback.trim()) {
      onSendBack(feedback.trim());
      setShowSendBack(false);
      setFeedback('');
    }
  }

  if (showSendBack) {
    return (
      <div className="border-t bg-white p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Send Back to Ideation</h4>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Explain what needs to change before this feature can be approved..."
          className="w-full text-sm border rounded-md p-2 resize-y min-h-[80px] focus:ring-1 focus:ring-amber-300 focus:border-amber-300 mb-2"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={handleSendBack}
            disabled={!feedback.trim() || isSendingBack}
            className="px-3 py-1.5 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSendingBack ? 'Sending...' : 'Send Back'}
          </button>
          <button
            onClick={() => {
              setShowSendBack(false);
              setFeedback('');
            }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t bg-white p-3 flex items-center gap-3">
      {/* Stats */}
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-1">
        {pendingCount > 0 && (
          <span className="bg-gray-100 px-2 py-0.5 rounded">{pendingCount} pending</span>
        )}
        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
          {acceptedCount} accepted
        </span>
        {rejectedCount > 0 && (
          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded">
            {rejectedCount} rejected
          </span>
        )}
        {!isReviewActive && totalDecided > 0 && (
          <span className="text-gray-400 italic ml-1">Review complete</span>
        )}
      </div>

      {/* Actions */}
      {isReviewActive && (
        <div className="flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={!canApprove || isApproving}
            className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={pendingCount > 0 ? `${pendingCount} items still pending` : undefined}
          >
            {isApproving ? 'Approving...' : 'Approve'}
          </button>
        </div>
      )}

      <button
        onClick={onClose}
        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Close
      </button>
    </div>
  );
}
