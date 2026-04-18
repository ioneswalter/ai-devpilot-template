/** FeatureListView - Grouped list of features with expandable rows. */
import type { MutableRefObject } from 'react';
import type { ProductFeature } from './roadmap-helpers';
import { FeatureDetailPanel } from './FeatureDetailPanel';
import { FeatureRow } from './FeatureRow';
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
  onNewVersion?: (feature: ProductFeature) => void;
  getPipeline?: (featureId: string) => FeaturePipelineState | undefined;
  onPipelineStageClick?: (feature: ProductFeature, stage: PipelineStageName) => void;
  getFeatureCost?: (featureId: string) => number | null;
  canAccessPanel?: (stage: PipelineStageName) => boolean;
  getVersionLabel?: (featureId: string) => string | null;
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
  onNewVersion,
  getPipeline,
  onPipelineStageClick,
  getFeatureCost,
  canAccessPanel,
  getVersionLabel,
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
                      onNewVersion={onNewVersion}
                      pipeline={getPipeline?.(feature.id)}
                      onPipelineStageClick={onPipelineStageClick ? (stage) => onPipelineStageClick(feature, stage) : undefined}
                      aiCost={getFeatureCost?.(feature.id) ?? null}
                      canAccessPanel={canAccessPanel}
                      currentVersionLabel={getVersionLabel?.(feature.id) ?? null}
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
