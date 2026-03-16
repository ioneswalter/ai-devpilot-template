/**
 * RoadmapContent - Main roadmap page component (orchestrator).
 * Composes header, filters, list/kanban views, copilot, and admin modals.
 */

import { CopilotPanel, CopilotToggle } from '../../features/copilot';
import { KanbanBoard } from '../../components/roadmap/KanbanBoard';
import { useRoadmapData } from './useRoadmapData';
import { RoadmapHeader } from './RoadmapHeader';
import { RoadmapFilters } from './RoadmapFilters';
import { FeatureListView } from './FeatureListView';
import { AdminModals } from './AdminModals';

export function RoadmapContent({ featureParam, isMember }: { featureParam?: string; isMember: boolean }) {
  const roadmap = useRoadmapData(featureParam);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header: Title + Stats */}
      <RoadmapHeader
        stats={roadmap.stats}
        isFiltered={roadmap.isFiltered}
        isAdmin={roadmap.isAdmin}
        isMember={isMember}
      />

      {/* Loading / Error State */}
      {roadmap.isLoading && (
        <div className="bg-blue-50 border-b border-blue-100 py-1.5">
          <div className="container mx-auto px-4 text-center text-xs text-blue-600">
            <span className="flex items-center justify-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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

      {/* Kanban Board View */}
      {roadmap.viewMode === 'kanban' && (
        <KanbanBoard
          features={roadmap.filteredFeatures}
          isAdmin={roadmap.isAdmin}
          onTransitionRequest={roadmap.handleTransitionRequest}
          updatingId={roadmap.isTransitioning ? roadmap.pendingTransition?.featureId : null}
          onFeatureClick={roadmap.handleKanbanFeatureClick}
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
        />
      )}

      {/* AI Copilot (Admin Only) */}
      {roadmap.isAdmin && (
        <>
          <CopilotToggle isOpen={roadmap.copilotOpen} onClick={() => roadmap.setCopilotOpen(!roadmap.copilotOpen)} />
          <CopilotPanel
            isOpen={roadmap.copilotOpen}
            onClose={() => roadmap.setCopilotOpen(false)}
            selectedFeature={roadmap.selectedFeatureForCopilot}
            onFeatureUpdated={roadmap.handleFeatureUpdated}
          />
        </>
      )}

      {/* Admin Modals */}
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
        onTransitionConfirm={roadmap.handleTransitionConfirm}
        onTransitionCancel={roadmap.handleTransitionCancel}
      />
    </div>
  );
}
