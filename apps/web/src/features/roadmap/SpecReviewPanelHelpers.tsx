/**
 * SpecReviewPanelHelpers — Utility functions and sub-views extracted from SpecReviewPanel.
 */

import type { ReviewItem, ReviewItemType } from './spec-review-types';
import { CopyableCommand } from '@/components/ui/CopyableCommand';

export function groupItemsByType(items: ReviewItem[]): Record<string, ReviewItem[]> {
  const groups: Record<string, ReviewItem[]> = {};
  for (const item of items) {
    const key = item.item_type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function formatModelName(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return null;
}

export const sectionOrder: ReviewItemType[] = [
  'criterion',
  'test_case',
  'edge_case',
  'description',
];

export const sectionLabels: Record<string, string> = {
  criterion: 'Acceptance Criteria',
  test_case: 'Test Cases',
  edge_case: 'Edge Cases',
  description: 'Description Enhancements',
};

// --- Gate banner sub-components ---

interface ProposalReviewBannerProps {
  featureCode: string;
}

export function ProposalReviewBanner({ featureCode }: ProposalReviewBannerProps) {
  return (
    <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
      <svg
        className="w-5 h-5 text-amber-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800">Proposal Review Required</p>
        <p className="text-xs text-amber-700">
          Run{' '}
          <CopyableCommand command={`\\review-proposal ${featureCode}`} className="bg-amber-100" />{' '}
          first, then <CopyableCommand command={`\\spec ${featureCode}`} className="bg-amber-100" />{' '}
          to generate the specification.
        </p>
      </div>
    </div>
  );
}

interface SpecGenerationBannerProps {
  featureCode: string;
}

export function SpecGenerationBanner({ featureCode }: SpecGenerationBannerProps) {
  return (
    <div className="px-4 py-3 border-b bg-violet-50 border-violet-200 flex items-center gap-3">
      <svg
        className="w-5 h-5 text-violet-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-violet-800">Specification Required</p>
        <p className="text-xs text-violet-700">
          This feature has been reviewed. Run{' '}
          <CopyableCommand command={`\\spec ${featureCode}`} className="bg-violet-100" /> in Claude
          Code to generate the specification. AI Review becomes available after the spec is
          generated.
        </p>
      </div>
    </div>
  );
}

export function SuccessView({
  showSuccess,
  acceptedCount,
  featureCode,
}: {
  showSuccess: string;
  acceptedCount: number;
  featureCode: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center ${
          showSuccess === 'approved' ? 'bg-green-100' : 'bg-amber-100'
        }`}
      >
        <svg
          className={`w-7 h-7 ${showSuccess === 'approved' ? 'text-green-600' : 'text-amber-600'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {showSuccess === 'approved' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
          ? `${acceptedCount} items added to ${featureCode}`
          : `Feedback sent — ${featureCode} returned to ideation`}
      </p>
    </div>
  );
}
