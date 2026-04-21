/**
 * SpecReviewStartView — shown when no AI review exists yet.
 * Includes gate banners and the Start AI Review action bar.
 */

import { SpecArtifactsView } from './SpecArtifactsView';
import { CopyableCommand } from '@/components/ui/CopyableCommand';

interface SpecReviewStartViewProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  needsProposalReview: boolean;
  needsSpecGeneration: boolean;
  isStarting: boolean;
  startError: unknown;
  onStartReview: () => void;
  onArtifactsLoaded: (count: number | null) => void;
  onClose: () => void;
}

export function SpecReviewStartView({
  featureId, featureCode, featureTitle,
  needsProposalReview, needsSpecGeneration,
  isStarting, startError, onStartReview,
  onArtifactsLoaded, onClose,
}: SpecReviewStartViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">Review spec artifacts, then start an AI review to enrich with suggestions.</p>
      </div>

      {needsProposalReview && (
        <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">Proposal Review Required</p>
            <p className="text-xs text-amber-700">Run <CopyableCommand command={`\\review-proposal ${featureCode}`} className="bg-amber-100" /> first, then <CopyableCommand command={`\\spec ${featureCode}`} className="bg-amber-100" /> to generate the specification.</p>
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
            <p className="text-xs text-violet-700">This feature has been reviewed. Run <CopyableCommand command={`\\spec ${featureCode}`} className="bg-violet-100" /> in Claude Code to generate the specification. AI Review becomes available after the spec is generated.</p>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
        {isStarting ? (
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
              onClick={onStartReview}
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
        {startError ? (
          <p className="text-xs text-red-500">{startError instanceof Error ? startError.message : String(startError)}</p>
        ) : null}
      </div>

      <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
        <p className="text-xs text-indigo-700">
          Run <CopyableCommand command={`\\generate-prototype ${featureCode}`} className="bg-indigo-100" /> in Claude Code to create a visual prototype for this feature.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <SpecArtifactsView featureId={featureId} onArtifactsLoaded={onArtifactsLoaded} />
      </div>
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    </div>
  );
}
