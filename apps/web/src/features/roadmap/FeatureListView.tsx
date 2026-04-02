/** FeatureListView - Grouped list of features with expandable rows. */
import type { MutableRefObject } from 'react';
import { getStatusBadge, getPriorityBadge, getTypeBadge, getCategoryBadge } from '../../components/roadmap/badge-utils';
import { CollapsibleDescription, type ProductFeature } from './roadmap-helpers';
import { FeatureDetailPanel } from './FeatureDetailPanel';
import { PipelineBar } from './PipelineBar';
import type { FeaturePipelineState, PipelineStageName } from './pipeline-types';

interface FeatureListViewProps {
  groupedFeatures: Record<string, ProductFeature[]>;
  features: ProductFeature[];
  filteredFeatures: ProductFeature[];
  expandedFeature: string | null;
  toggleExpanded: (featureId: string) => void;
  featureRowRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  isLoading: boolean;
  isAdmin: boolean;
  isMember: boolean;
  onEditFeature: (feature: ProductFeature) => void;
  onDeleteFeature: (feature: ProductFeature) => void;
  onLinkCriteria: (feature: ProductFeature) => void;
  getPipeline?: (featureId: string) => FeaturePipelineState | undefined;
  onPipelineStageClick?: (feature: ProductFeature, stage: PipelineStageName) => void;
  getFeatureCost?: (featureId: string) => number | null;
}

export function FeatureListView({
  groupedFeatures,
  features,
  filteredFeatures,
  expandedFeature,
  toggleExpanded,
  featureRowRefs,
  isLoading,
  isAdmin,
  isMember,
  onEditFeature,
  onDeleteFeature,
  onLinkCriteria,
  getPipeline,
  onPipelineStageClick,
  getFeatureCost,
}: FeatureListViewProps) {
  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Loading skeleton */}
          {isLoading && features.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-16 bg-gray-200 rounded" />
                    <div className="h-4 flex-1 bg-gray-200 rounded" />
                    <div className="h-6 w-20 bg-gray-200 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Feature sections */}
          {Object.entries(groupedFeatures)
            .sort((a, b) => {
              const aHasJourney = a[1].some((f) => f.feature_type === 'journey');
              const bHasJourney = b[1].some((f) => f.feature_type === 'journey');
              if (aHasJourney && !bHasJourney) return -1;
              if (!aHasJourney && bHasJourney) return 1;
              return 0;
            })
            .map(([section, sectionFeatures]) => (
            <div key={section}>
              <h2 className="text-lg lg:text-xl font-bold text-gray-900 mb-3 lg:mb-4 flex flex-wrap items-center gap-2">
                <span className="bg-blue-100 text-blue-800 px-2 lg:px-3 py-1 rounded-lg text-sm lg:text-base">{section}</span>
                <span className="text-xs lg:text-sm font-normal text-gray-500">{sectionFeatures.length} features</span>
              </h2>
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {sectionFeatures.map((feature, index) => (
                  <div
                    key={feature.id}
                    ref={(el) => { featureRowRefs.current[feature.id] = el; }}
                    className={index > 0 ? 'border-t' : ''}
                  >
                    <FeatureRow
                      feature={feature}
                      isExpanded={expandedFeature === feature.id}
                      toggleExpanded={toggleExpanded}
                      isAdmin={isAdmin}
                      onEditFeature={onEditFeature}
                      onDeleteFeature={onDeleteFeature}
                      onLinkCriteria={onLinkCriteria}
                      pipeline={getPipeline?.(feature.id)}
                      onPipelineStageClick={onPipelineStageClick ? (stage) => onPipelineStageClick(feature, stage) : undefined}
                      aiCost={getFeatureCost?.(feature.id) ?? null}
                    />

                    {/* Expanded Detail */}
                    {expandedFeature === feature.id && (
                      <FeatureDetailPanel
                        feature={feature}
                        features={features}
                        isMember={isMember}
                        isAdmin={isAdmin}
                        toggleExpanded={toggleExpanded}
                        featureRowRefs={featureRowRefs}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!isLoading && features.length > 0 && filteredFeatures.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">No features match your filters</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
/** FeatureRow - A single collapsed feature row */
interface FeatureRowProps {
  feature: ProductFeature;
  isExpanded: boolean;
  toggleExpanded: (featureId: string) => void;
  isAdmin: boolean;
  onEditFeature: (feature: ProductFeature) => void;
  onDeleteFeature: (feature: ProductFeature) => void;
  onLinkCriteria: (feature: ProductFeature) => void;
  pipeline?: FeaturePipelineState;
  onPipelineStageClick?: (stage: PipelineStageName) => void;
  aiCost?: number | null;
}

function FeatureRow({
  feature,
  isExpanded,
  toggleExpanded,
  isAdmin,
  onEditFeature,
  onDeleteFeature,
  onLinkCriteria,
  pipeline,
  onPipelineStageClick,
  aiCost,
}: FeatureRowProps) {
  const chevronClass = `transition-transform ${isExpanded ? 'rotate-180' : ''}`;

  const handleCodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(feature.id);
    navigator.clipboard.writeText(`${window.location.origin}/roadmap?feature=${feature.feature_code}`);
  };

  return (
    <div
      className="p-3 lg:p-4 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => toggleExpanded(feature.id)}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
        {/* Mobile: Code + Badges row */}
        <div className="flex items-center justify-between lg:hidden">
          <code
            className="text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            onClick={handleCodeClick}
            title={`Click to copy link to ${feature.feature_code}`}
          >
            {feature.feature_code}
          </code>
          <div className="flex items-center gap-1.5">
            {getCategoryBadge(feature.category)}
            {getTypeBadge(feature.feature_type)}
            {getPriorityBadge(feature.priority)}
            {getStatusBadge(feature.status)}
            <svg
              className={`w-4 h-4 text-gray-400 ${chevronClass}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Desktop: Code column */}
        <div className="hidden lg:block flex-shrink-0 w-20">
          <code
            className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            onClick={handleCodeClick}
            title={`Click to copy link to ${feature.feature_code}`}
          >
            {feature.feature_code}
          </code>
        </div>

        {/* Title and description */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1 lg:gap-2 mb-1">
            <span className="font-medium text-gray-900 text-sm lg:text-base">{feature.title}</span>
            {feature.acceptance_criteria && feature.acceptance_criteria.length > 0 && (
              <span className="text-xs text-gray-400">
                ({feature.acceptance_criteria.length} criteria)
              </span>
            )}
            {feature.test_cases && feature.test_cases.length > 0 && (
              <span className="text-xs text-green-600">
                {feature.test_cases.length} test{feature.test_cases.length > 1 ? 's' : ''}
              </span>
            )}
            {aiCost != null && aiCost > 0 && (
              <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded" title="AI usage cost">
                ${aiCost < 0.01 ? aiCost.toFixed(4) : aiCost.toFixed(2)}
              </span>
            )}
          </div>
          <CollapsibleDescription text={feature.description} maxLines={3} />
          {/* Pipeline Bar */}
          <PipelineBar
            featureStatus={feature.status}
            pipeline={pipeline}
            isAdmin={isAdmin}
            onStageClick={onPipelineStageClick}
          />
          {/* Related User Stories - shown inline for FRs */}
          {feature.related_user_stories && feature.related_user_stories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="text-xs text-gray-400">Implements:</span>
              {feature.related_user_stories.map((usCode) => (
                <span
                  key={usCode}
                  className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700"
                >
                  {usCode}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: Badges column */}
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          {getCategoryBadge(feature.category)}
          {getTypeBadge(feature.feature_type)}
          {getPriorityBadge(feature.priority)}
          {getStatusBadge(feature.status)}
          {/* Admin buttons */}
          {isAdmin && (
            <div className="flex items-center gap-1 ml-2">
              {feature.feature_type === 'journey' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkCriteria(feature);
                  }}
                  className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                  title="Link acceptance criteria to features"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </button>
              )}
              {['proposed', 'approved'].includes(feature.status) && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFeature(feature);
                    }}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFeature(feature);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 ${chevronClass}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
