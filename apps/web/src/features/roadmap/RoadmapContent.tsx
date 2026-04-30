/** RoadmapContent - Main roadmap page orchestrator. */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CopilotPanel } from '../../features/copilot';
import { KanbanBoard } from '../../components/roadmap/KanbanBoard';
import { useRoadmapData } from './useRoadmapData';
import { RoadmapHeader } from './RoadmapHeader';
import { RoadmapFilters } from './RoadmapFilters';
import { FeatureListView } from './FeatureListView';
import { AdminModals } from './AdminModals';
import { PipelineModals } from './PipelineModals';
import { UatStartModal } from './UatStartModal';
import { DeployStartModal } from './DeployStartModal';
import { usePipelineStatus } from './usePipelineStatus';
import { useFeatureAICosts } from './useFeatureAICosts';
import { NotificationBanner } from './NotificationBanner';
import { VersionBumpModal } from './VersionBumpModal';
import type { ProductFeature } from './roadmap-helpers';
import type { PipelineStageName } from './pipeline-types';
import { useUserRoles } from '@/hooks/useUserRoles';
import { supabase } from '@/lib/supabase-client';

export function RoadmapContent({
  featureParam,
  isMember,
}: {
  featureParam?: string;
  isMember: boolean;
}) {
  const roadmap = useRoadmapData(featureParam);
  const pipeline = usePipelineStatus();
  const { getFeatureCost } = useFeatureAICosts();
  const { canAccessPanel, isUnrestricted } = useUserRoles();
  const [reviewingFeature, setReviewingFeature] = useState<ProductFeature | null>(null);
  const [implementingFeature, setImplementingFeature] = useState<ProductFeature | null>(null);
  const [testingFeature, setTestingFeature] = useState<ProductFeature | null>(null);
  const [uatFeature, setUatFeature] = useState<ProductFeature | null>(null);
  const [uatStartFeature, setUatStartFeature] = useState<ProductFeature | null>(null);
  const [deployStartFeature, setDeployStartFeature] = useState<ProductFeature | null>(null);
  const [showReleases, setShowReleases] = useState(false);
  const [showFixTasks, setShowFixTasks] = useState(
    () => new URLSearchParams(window.location.search).get('fixTasks') === 'open'
  );
  const [versionBumpFeature, setVersionBumpFeature] = useState<ProductFeature | null>(null);

  // FR-149: Fetch version labels for all versioned features
  const versionLabelsRef = useRef<Record<string, string>>({});
  const [versionLabelsLoaded, setVersionLabelsLoaded] = useState(false);

  useEffect(() => {
    const featureIds = roadmap.features.map((f) => f.id);
    if (featureIds.length === 0) return;
    supabase
      .from('feature_versions')
      .select('feature_id, version_label, version_number')
      .in('feature_id', featureIds)
      .is('superseded_by', null)
      .order('version_number', { ascending: false })
      .then(({ data }) => {
        const labels: Record<string, string> = {};
        for (const v of data ?? []) {
          if (!labels[v.feature_id] && v.version_label) {
            labels[v.feature_id] = v.version_label;
          }
        }
        versionLabelsRef.current = labels;
        setVersionLabelsLoaded(true);
      });
  }, [roadmap.features]);

  const getVersionLabel = useCallback(
    (featureId: string): string | null => {
      return versionLabelsRef.current[featureId] ?? null;
    },
    [versionLabelsLoaded]
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePipelineStageClick = useCallback(
    (feature: ProductFeature, stage: PipelineStageName) => {
      if (!roadmap.isAdmin) return;
      if (!canAccessPanel(stage)) return;

      switch (stage) {
        case 'spec': {
          // SpecReviewPanel handles every state: it renders SpecReviewStartView
          // with `needsProposalReview` for a proposed feature and
          // `needsSpecGeneration` for a reviewed feature that has no
          // spec_reviews row yet — both surface the next-step CLI command.
          // (Earlier code short-circuited on spec.status === 'not_started',
          //  which was the bug behind FR-141 ignoring the click after review.)
          roadmap.fetchFeatures();
          pipeline.invalidate();
          setReviewingFeature(feature);
          break;
        }
        case 'build': {
          // Always allow opening build panel
          setImplementingFeature(feature);
          break;
        }
        case 'test':
          setTestingFeature(feature);
          break;
        case 'uat':
          // List-view equivalent of dragging to the Acceptance column on the Board.
          // Drag-and-drop path (handleTransitionConfirm in useRoadmapData) is unchanged;
          // this just gives admins a click target on the pipeline bar.
          if (feature.status === 'in_testing') {
            setUatStartFeature(feature);
          } else {
            // Package already exists (in_acceptance or beyond) — open review panel.
            setUatFeature(feature);
          }
          break;
        case 'deploy':
          // FR-146: Open implementation panel to show deploy progress + release button
          if (feature.status === 'released') return;
          // UAT-approved features get the Release modal with a copyable \deploy snippet,
          // matching the UAT pill pattern. Other statuses keep the existing implementation
          // panel (used for in-flight deploys, build progress, etc.).
          if (feature.status === 'in_acceptance') {
            setDeployStartFeature(feature);
          } else {
            setImplementingFeature(feature);
          }
          break;
      }
    },
    [roadmap.isAdmin, roadmap.handleTransitionRequest, pipeline]
  );

  const handleKanbanPipelineClick = useCallback(
    (featureId: string, stage: PipelineStageName) => {
      const feature = roadmap.features.find((f) => f.id === featureId);
      if (feature) handlePipelineStageClick(feature, stage);
    },
    [roadmap.features, handlePipelineStageClick]
  );
  useEffect(() => {
    if (reviewingFeature) {
      const updated = roadmap.features.find((f) => f.id === reviewingFeature.id);
      if (updated && updated !== reviewingFeature) setReviewingFeature(updated);
    }
    if (testingFeature) {
      const updated = roadmap.features.find((f) => f.id === testingFeature.id);
      if (updated && updated !== testingFeature) setTestingFeature(updated);
    }
    if (implementingFeature) {
      const updated = roadmap.features.find((f) => f.id === implementingFeature.id);
      if (updated && updated !== implementingFeature) setImplementingFeature(updated);
    }
    if (uatFeature) {
      const updated = roadmap.features.find((f) => f.id === uatFeature.id);
      if (updated && updated !== uatFeature) setUatFeature(updated);
    } else if (roadmap.features.length > 0) {
      const param = new URLSearchParams(window.location.search).get('uat');
      const f = param
        ? roadmap.features.find((x) => x.feature_code === param || x.id === param)
        : null;
      if (f) setUatFeature(f);
    }
  }, [roadmap.features]);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header: Title + Stats */}
      <RoadmapHeader
        stats={roadmap.stats}
        isFiltered={roadmap.isFiltered}
        isAdmin={roadmap.isAdmin}
        isMember={isMember}
        onOpenReleases={() => setShowReleases(true)}
        onOpenFixTasks={() => setShowFixTasks(true)}
        isUnrestricted={isUnrestricted}
      />

      {roadmap.isLoading && (
        <div className="bg-blue-50 border-b border-blue-100 py-1.5">
          <div className="container mx-auto px-4 text-center text-xs text-blue-600">
            <span className="flex items-center justify-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Loading...
            </span>
          </div>
        </div>
      )}
      {roadmap.loadError && !roadmap.isLoading && (
        <div className="bg-red-50 border-b border-red-100 py-2">
          <div className="container mx-auto px-4 text-center">
            <p className="text-xs text-red-600 mb-1">{roadmap.loadError}</p>
            <button
              onClick={roadmap.fetchFeatures}
              className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <RoadmapFilters
        searchTerm={roadmap.searchTerm}
        onSearchChange={roadmap.setSearchTerm}
        viewMode={roadmap.viewMode}
        onViewModeChange={roadmap.setViewMode}
        filterStatus={roadmap.filterStatus}
        onFilterStatusChange={roadmap.setFilterStatus}
        filterType={roadmap.filterType}
        onFilterTypeChange={roadmap.setFilterType}
        filterPriority={roadmap.filterPriority}
        onFilterPriorityChange={roadmap.setFilterPriority}
        filterCategory={roadmap.filterCategory}
        onFilterCategoryChange={roadmap.setFilterCategory}
        filterSection={roadmap.filterSection}
        onFilterSectionChange={roadmap.setFilterSection}
        availableSections={roadmap.availableSections}
        isAdmin={roadmap.isAdmin}
        filteredCount={roadmap.filteredFeatures.length}
        totalCount={roadmap.features.length}
        onClearFilters={roadmap.clearFilters}
      />

      {/* FR-116: Test-ready notification banner */}
      {roadmap.isAdmin && (
        <div className="container mx-auto px-4 mt-2">
          <NotificationBanner
            onNavigateToFeature={(fId, tab) => {
              const f = roadmap.features.find((feat) => feat.id === fId);
              if (f) {
                if (tab === 'uat') setUatFeature(f);
                else setTestingFeature(f);
              }
            }}
          />
        </div>
      )}

      {/* Kanban Board View */}
      {roadmap.viewMode === 'kanban' && (
        <KanbanBoard
          features={roadmap.filteredFeatures}
          isAdmin={roadmap.isAdmin}
          onTransitionRequest={roadmap.handleTransitionRequest}
          updatingId={roadmap.isTransitioning ? roadmap.pendingTransition?.featureId : null}
          onFeatureClick={roadmap.handleKanbanFeatureClick}
          getPipeline={pipeline.getPipeline}
          onPipelineStageClick={roadmap.isAdmin ? handleKanbanPipelineClick : undefined}
        />
      )}

      {/* Features List View */}
      {roadmap.viewMode === 'list' && (
        <FeatureListView
          groupedFeatures={roadmap.groupedFeatures}
          features={roadmap.features}
          filteredFeatures={roadmap.filteredFeatures}
          expandedFeature={roadmap.expandedFeature}
          toggleExpanded={roadmap.toggleExpanded}
          featureRowRefs={roadmap.featureRowRefs}
          isLoading={roadmap.isLoading}
          isAdmin={roadmap.isAdmin}
          isMember={isMember}
          onEditFeature={roadmap.setEditingFeature}
          onDeleteFeature={roadmap.setDeletingFeature}
          onLinkCriteria={roadmap.setLinkingCriteriaFeature}
          onNewVersion={roadmap.isAdmin ? setVersionBumpFeature : undefined}
          getPipeline={pipeline.getPipeline}
          onPipelineStageClick={roadmap.isAdmin ? handlePipelineStageClick : undefined}
          getFeatureCost={roadmap.isAdmin ? getFeatureCost : undefined}
          canAccessPanel={canAccessPanel}
          getVersionLabel={getVersionLabel}
        />
      )}

      {/* AI Copilot (Admin Only) */}
      {roadmap.isAdmin && roadmap.copilotOpen && (
        <CopilotPanel
          isOpen={roadmap.copilotOpen}
          onClose={() => roadmap.setCopilotOpen(false)}
          selectedFeature={roadmap.selectedFeatureForCopilot}
          onFeatureUpdated={roadmap.handleFeatureUpdated}
        />
      )}

      <PipelineModals
        reviewingFeature={reviewingFeature}
        setReviewingFeature={setReviewingFeature}
        implementingFeature={implementingFeature}
        setImplementingFeature={setImplementingFeature}
        testingFeature={testingFeature}
        setTestingFeature={setTestingFeature}
        uatFeature={uatFeature}
        setUatFeature={setUatFeature}
        showReleases={showReleases}
        setShowReleases={setShowReleases}
        showFixTasks={showFixTasks}
        setShowFixTasks={setShowFixTasks}
        onFetchFeatures={roadmap.fetchFeatures}
        onPipelineInvalidate={pipeline.invalidate}
      />
      <UatStartModal
        feature={uatStartFeature}
        onClose={() => {
          // Closing the modal — refresh so the pipeline bar reflects the new
          // in_acceptance status if the user got as far as Start before closing.
          setUatStartFeature(null);
          roadmap.fetchFeatures();
          pipeline.invalidate();
        }}
        onContinueToReview={(f) => {
          setUatStartFeature(null);
          roadmap.fetchFeatures();
          pipeline.invalidate();
          setUatFeature(f);
        }}
      />
      <DeployStartModal
        feature={deployStartFeature}
        onClose={() => setDeployStartFeature(null)}
      />
      <AdminModals
        features={roadmap.features}
        editingFeature={roadmap.editingFeature}
        onCloseEdit={() => roadmap.setEditingFeature(null)}
        onEditSuccess={roadmap.fetchFeatures}
        deletingFeature={roadmap.deletingFeature}
        isDeleting={roadmap.isDeleting}
        onCloseDeletion={() => roadmap.setDeletingFeature(null)}
        onConfirmDelete={roadmap.handleDeleteFeature}
        linkingCriteriaFeature={roadmap.linkingCriteriaFeature}
        onCloseLinkCriteria={() => roadmap.setLinkingCriteriaFeature(null)}
        onLinkCriteriaSuccess={roadmap.fetchFeatures}
        pendingTransition={roadmap.pendingTransition}
        isTransitioning={roadmap.isTransitioning}
        transitionError={roadmap.transitionError}
        onTransitionConfirm={async () => {
          await roadmap.handleTransitionConfirm();
          pipeline.invalidate();
        }}
        onTransitionCancel={roadmap.handleTransitionCancel}
        onReviewWithAI={setReviewingFeature}
        onStartImplementation={setImplementingFeature}
        onRunTests={setTestingFeature}
      />

      {/* FR-149: Version Bump Modal */}
      {versionBumpFeature && (
        <VersionBumpModal
          featureId={versionBumpFeature.id}
          featureCode={versionBumpFeature.feature_code}
          featureTitle={versionBumpFeature.title}
          currentVersion={getVersionLabel(versionBumpFeature.id)}
          onClose={() => setVersionBumpFeature(null)}
          onSuccess={() => {
            setVersionBumpFeature(null);
            roadmap.fetchFeatures();
            pipeline.invalidate();
          }}
        />
      )}
    </div>
  );
}
