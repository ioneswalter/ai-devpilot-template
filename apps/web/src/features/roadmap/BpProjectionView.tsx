/**
 * FR-130 v2.1 — BP-friendly projection of an acceptance criterion.
 *
 * Default render for BP-role users: plain-English statement + numbered
 * how-to-test steps + expected-outcome line. No Gherkin visible.
 *
 * Engineer/admin role gets a "View technical criterion" toggle that reveals
 * the raw Gherkin text alongside, plus a source badge (quickstart_scraped /
 * ai_generated / manually_reviewed).
 *
 * When the projection is null (generation failed) or its plain_english_statement
 * is empty, the consumer should render the raw criterion_text as fallback per
 * AC-38; this component renders nothing in that case.
 */

import { useState } from 'react';
import type { BpReviewProjection } from '@/lib/api/uat-review-api';

interface BpProjectionViewProps {
  projection: BpReviewProjection;
  rawCriterion: string;
  isEngineerOrAdmin: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

const SOURCE_LABELS: Record<BpReviewProjection['source'], string> = {
  quickstart_scraped: 'Scraped from quickstart',
  ai_generated: 'AI-generated',
  manually_reviewed: 'Manually reviewed',
};

const SOURCE_COLORS: Record<BpReviewProjection['source'], string> = {
  quickstart_scraped: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ai_generated: 'bg-violet-50 text-violet-700 border-violet-200',
  manually_reviewed: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function BpProjectionView({
  projection,
  rawCriterion,
  isEngineerOrAdmin,
  onRegenerate,
  isRegenerating = false,
}: BpProjectionViewProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-900">{projection.plain_english_statement}</p>

      {projection.how_to_test.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            How to test
          </p>
          <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
            {projection.how_to_test.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {projection.expected_outcome && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            What you should see
          </p>
          <p className="text-sm text-gray-700">{projection.expected_outcome}</p>
        </div>
      )}

      {isEngineerOrAdmin && (
        <EngineerControls
          projection={projection}
          rawCriterion={rawCriterion}
          showTechnical={showTechnical}
          onToggle={() => setShowTechnical(!showTechnical)}
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      )}
    </div>
  );
}

interface EngineerControlsProps {
  projection: BpReviewProjection;
  rawCriterion: string;
  showTechnical: boolean;
  onToggle: () => void;
  onRegenerate?: () => void;
  isRegenerating: boolean;
}

function EngineerControls({
  projection,
  rawCriterion,
  showTechnical,
  onToggle,
  onRegenerate,
  isRegenerating,
}: EngineerControlsProps) {
  return (
    <div className="border-t border-gray-100 pt-2 mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border rounded ${SOURCE_COLORS[projection.source]}`}
          title="Projection source (engineer-only)"
        >
          {SOURCE_LABELS[projection.source]}
        </span>
        {projection.is_stale && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded">
            ⚠ Stale — criterion changed since generation
          </span>
        )}
        <button
          onClick={onToggle}
          className="text-[11px] font-medium text-gray-600 hover:text-gray-900 underline"
        >
          {showTechnical ? 'Hide technical criterion' : 'View technical criterion'}
        </button>
        {projection.is_stale && onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="text-[11px] font-medium text-violet-700 hover:text-violet-900 underline disabled:opacity-50"
          >
            {isRegenerating ? 'Regenerating…' : 'Regenerate projection'}
          </button>
        )}
      </div>

      {showTechnical && (
        <pre className="text-[11px] font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap break-words">
          {rawCriterion}
        </pre>
      )}
    </div>
  );
}
