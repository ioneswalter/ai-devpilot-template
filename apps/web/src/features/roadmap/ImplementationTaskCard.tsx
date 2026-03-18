/**
 * ImplementationTaskCard - Interactive task card for FR-105
 * Engineers can accept, reject, edit, comment, and view generated code.
 */

import { useState } from 'react';
import type { ImplementationTaskItem } from '@/lib/api/admin-api';

interface ImplementationTaskCardProps {
  item: ImplementationTaskItem;
  index: number;
  onDecision: (itemId: string, data: { decision?: string; title?: string; description?: string; comment?: string }) => void;
  onComment: (itemId: string, comment: string) => void;
  isUpdating: boolean;
  isImplementing: boolean;
}

const TASK_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  create: { bg: 'bg-green-100', text: 'text-green-700' },
  modify: { bg: 'bg-blue-100', text: 'text-blue-700' },
  test: { bg: 'bg-purple-100', text: 'text-purple-700' },
  config: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

const DECISION_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: '', text: 'text-gray-500' },
  accepted: { bg: 'border-green-200 bg-green-50/30', text: 'text-green-700' },
  rejected: { bg: 'border-red-200 bg-red-50/30', text: 'text-red-700' },
  modified: { bg: 'border-blue-200 bg-blue-50/30', text: 'text-blue-700' },
};

const IMPL_STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
  generating: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Generating...' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Generated' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export function ImplementationTaskCard({
  item,
  index,
  onDecision,
  onComment,
  isUpdating,
  isImplementing,
}: ImplementationTaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [showComments, setShowComments] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [copied, setCopied] = useState(false);

  const typeStyle = TASK_TYPE_STYLES[item.task_type] || TASK_TYPE_STYLES.create;
  const decisionStyle = DECISION_STYLES[item.decision] || DECISION_STYLES.pending;
  const implStatus = IMPL_STATUS_BADGE[item.implementation_status] || IMPL_STATUS_BADGE.pending;
  const commentCount = item.comments?.length ?? 0;
  const isGenerating = item.implementation_status === 'generating';
  const hasCode = !!item.generated_code;

  function handleCopyCode() {
    if (item.generated_code) {
      navigator.clipboard.writeText(item.generated_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className={`border rounded-lg p-3 transition-colors ${decisionStyle.bg} ${isGenerating ? 'animate-pulse' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-xs font-mono text-gray-400 mt-1 flex-shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          {/* Header badges */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
              {item.task_type}
            </span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              item.source === 'ai_generated' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {item.source === 'ai_generated' ? 'AI' : 'Manual'}
            </span>
            {/* Implementation status badge */}
            {item.implementation_status !== 'pending' && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${implStatus.bg} ${implStatus.text}`}>
                {isGenerating && (
                  <svg className="inline w-3 h-3 mr-1 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {implStatus.label}
              </span>
            )}
            {item.decision !== 'pending' && (
              <span className={`text-xs font-semibold ml-auto capitalize ${decisionStyle.text}`}>
                {item.decision}
              </span>
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-sm font-medium border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Task description..."
                className="w-full text-xs border rounded px-2 py-1.5 h-20 resize-none focus:ring-1 focus:ring-blue-300"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onDecision(item.id, { decision: 'modified', title: editTitle, description: editDescription });
                    setIsEditing(false);
                  }}
                  disabled={isUpdating || !editTitle.trim()}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditTitle(item.title); setEditDescription(item.description || ''); }}
                  className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              <code className="text-xs text-gray-500 font-mono">{item.file_path}</code>
              {item.description && <p className="mt-1 text-xs text-gray-600">{item.description}</p>}
              {item.ai_log && <p className="mt-1 text-xs text-gray-400 italic">{item.ai_log}</p>}
            </>
          )}

          {/* Action buttons */}
          {!isEditing && !isImplementing && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => onDecision(item.id, { decision: 'accepted' })}
                disabled={isUpdating}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  item.decision === 'accepted' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                } disabled:opacity-50`}
              >
                Accept
              </button>
              <button
                onClick={() => onDecision(item.id, { decision: 'rejected' })}
                disabled={isUpdating}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  item.decision === 'rejected' ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
                } disabled:opacity-50`}
              >
                Reject
              </button>
              <button onClick={() => setIsEditing(true)} disabled={isUpdating}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
              >
                Edit
              </button>
              <button onClick={() => setShowComments(!showComments)}
                className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {commentCount > 0 && <span>{commentCount}</span>}
              </button>
            </div>
          )}

          {/* Generated code viewer */}
          {hasCode && (
            <div className="mt-2">
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className={`w-3 h-3 transition-transform ${showCode ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {showCode ? 'Hide code' : 'View generated code'}
                <span className="text-gray-400 font-normal">({item.generated_code!.split('\n').length} lines)</span>
              </button>
              {showCode && (
                <div className="mt-2 relative">
                  <button
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-white/90 border rounded hover:bg-gray-50 z-10"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto">
                    <code>{item.generated_code}</code>
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Comments section */}
          {showComments && (
            <div className="mt-2 pt-2 border-t space-y-2">
              {item.comments?.map((c, ci) => (
                <div key={ci} className="text-xs">
                  <span className="font-medium text-gray-700">{c.user_name}</span>
                  <span className="text-gray-400 ml-1">{new Date(c.created_at).toLocaleDateString()}</span>
                  <p className="text-gray-600 mt-0.5">{c.text}</p>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..." className="flex-1 text-xs border rounded px-2 py-1 focus:ring-1 focus:ring-blue-300"
                  onKeyDown={(e) => { if (e.key === 'Enter') { onComment(item.id, commentText.trim()); setCommentText(''); } }}
                />
                <button onClick={() => { onComment(item.id, commentText.trim()); setCommentText(''); }}
                  disabled={!commentText.trim() || isUpdating}
                  className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
