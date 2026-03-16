/**
 * ConversationList — Displays conversations grouped by status
 * Shows title, message count, updated_at, status badge, and linked feature
 */

import { useState } from 'react';
import { SparklesIcon, XIcon, CheckCircleIcon } from './icons';
import type { ConversationListItem } from './types';

interface ConversationListProps {
  conversations: ConversationListItem[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
}

export function ConversationList({ conversations, isLoading, onSelect, onArchive }: ConversationListProps) {
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto" />
      </div>
    );
  }

  // Show empty state if no conversations, or if all are empty drafts
  const hasVisibleConversations = conversations.some((c) => c.message_count > 0 || c.status !== 'draft');
  if (conversations.length === 0 || !hasVisibleConversations) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
        <SparklesIcon className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No conversations yet</h3>
        <p className="text-gray-500 text-sm">
          Start an ideation to explore feature ideas with AI.
        </p>
      </div>
    );
  }

  // Only show conversations with messages (empty drafts are hidden)
  const activeDrafts = conversations.filter((c) => c.status === 'draft' && c.message_count > 0);
  const submitted = conversations.filter((c) => c.status === 'submitted');
  const archived = conversations.filter((c) => c.status === 'archived');

  return (
    <div className="space-y-6">
      {activeDrafts.length > 0 && (
        <Section title="In Progress" count={activeDrafts.length}>
          {activeDrafts.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              onSelect={onSelect}
              showArchive
              onArchiveClick={() => setArchiveConfirm(conv.id)}
            />
          ))}
        </Section>
      )}

      {submitted.length > 0 && (
        <Section title="Submitted" count={submitted.length}>
          {submitted.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} onSelect={onSelect} />
          ))}
        </Section>
      )}

      {archived.length > 0 && (
        <Section title="Archived" count={archived.length}>
          {archived.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} onSelect={onSelect} />
          ))}
        </Section>
      )}

      {/* Archive confirmation modal */}
      {archiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 mb-2">Archive conversation?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This conversation will be moved to the archived section. You can still view it but cannot continue chatting.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setArchiveConfirm(null)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => { onArchive(archiveConfirm); setArchiveConfirm(null); }}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title} <span className="text-gray-300">({count})</span>
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  // Ensure UTC timestamps without timezone suffix are parsed correctly
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const date = new Date(normalized);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Truncate a long title (e.g. first user message) to something readable */
function smartTitle(title: string, maxLen = 80): string {
  if (title.length <= maxLen) return title;
  // Try to cut at a sentence boundary
  const truncated = title.substring(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastComma = truncated.lastIndexOf(',');
  const cutAt = Math.max(lastPeriod, lastComma);
  if (cutAt > maxLen * 0.5) return truncated.substring(0, cutAt + 1);
  return truncated.trimEnd() + '...';
}

const statusConfig: Record<string, { badge: string; icon?: boolean }> = {
  draft: { badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  submitted: { badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: true },
  archived: { badge: 'bg-gray-50 text-gray-500 border-gray-200' },
};

interface ConversationItemProps {
  conv: ConversationListItem;
  onSelect: (id: string) => void;
  showArchive?: boolean;
  onArchiveClick?: () => void;
}

function ConversationItem({ conv, onSelect, showArchive, onArchiveClick }: ConversationItemProps) {
  const config = statusConfig[conv.status] ?? statusConfig.draft;

  return (
    <div className="bg-white rounded-lg border hover:border-emerald-300 hover:shadow-sm transition-all flex group">
      <button
        onClick={() => onSelect(conv.id)}
        className="flex-1 px-4 py-3 text-left min-w-0"
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-medium text-gray-900 text-sm leading-snug">
            {smartTitle(conv.title)}
          </h4>
          <div className="flex items-center gap-2 flex-shrink-0">
            {conv.submitted_feature_code && (
              <span className="flex items-center gap-1 text-emerald-600 font-mono text-xs font-semibold">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                {conv.submitted_feature_code}
              </span>
            )}
            {conv.submitted_feature_title && (
              <span className="text-xs text-gray-400 hidden lg:inline max-w-[150px] truncate">
                {conv.submitted_feature_title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${config.badge}`}>
            {conv.status}
          </span>
          <span>{conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}</span>
          <span>{formatDate(conv.updated_at)}</span>
        </div>
      </button>
      {showArchive && (
        <button
          onClick={(e) => { e.stopPropagation(); onArchiveClick?.(); }}
          className="px-3 text-gray-300 hover:text-red-500 border-l opacity-0 group-hover:opacity-100 transition-opacity"
          title="Archive"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
