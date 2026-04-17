/**
 * DevPilotHub — Central admin dashboard for AI-powered feature ideation
 * Shows conversation list grouped by status with quick actions
 */

import { ConversationList } from './ConversationList';
import { ArrowLeftIcon, PlusIcon, SparklesIcon } from './icons';
import type { ConversationListItem } from './types';

interface DevPilotHubProps {
  conversations: ConversationListItem[];
  isLoading: boolean;
  isCreating: boolean;
  onNewIdeation: () => void;
  onSelectConversation: (id: string) => void;
  onArchive: (id: string) => void;
  onBack?: () => void;
  onNavigateIntegrations?: () => void;
}

export function DevPilotHub({
  conversations,
  isLoading,
  isCreating,
  onNewIdeation,
  onSelectConversation,
  onArchive,
  onBack,
  onNavigateIntegrations,
}: DevPilotHubProps) {
  const draftCount = conversations.filter((c) => c.status === 'draft' && c.message_count > 0).length;
  const submittedCount = conversations.filter((c) => c.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
            )}
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <SparklesIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ideation</h1>
              <p className="text-gray-400 text-xs mt-0.5">AI-powered feature ideation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateIntegrations && (
              <button
                onClick={onNavigateIntegrations}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Integrations
              </button>
            )}
            <button
              onClick={onNewIdeation}
              disabled={isCreating}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium text-sm shadow-sm"
            >
              <PlusIcon className="h-4 w-4" />
              New Ideation
            </button>
          </div>
        </div>

        {/* Quick stats */}
        {!isLoading && (draftCount > 0 || submittedCount > 0) && (
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">{draftCount}</span>
              <span className="text-gray-500">in progress</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">{submittedCount}</span>
              <span className="text-gray-500">submitted</span>
            </div>
          </div>
        )}

        {/* Conversation list */}
        <ConversationList
          conversations={conversations}
          isLoading={isLoading}
          onSelect={onSelectConversation}
          onArchive={onArchive}
        />
      </div>
    </div>
  );
}
