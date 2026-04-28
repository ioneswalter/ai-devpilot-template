/**
 * ReleasePanel - Main modal container for release management
 * Handles state management, view switching, and Create Release functionality
 */

import { useState, useCallback, useMemo } from 'react';
import { ReleaseHistory } from './ReleaseHistory';
import { ReleaseListView } from './ReleaseListView';
import { ReleaseDetailView } from './ReleaseDetailView';
import { CreateReleaseForm } from './CreateReleaseForm';
import { useReleases } from './useReleases';

const XIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PlusIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const PackageIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m16.5 9.4-9-5.19" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);
const HistoryIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

type ViewMode = 'list' | 'detail' | 'create' | 'history';

interface ReleasePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: ViewMode;
  initialReleaseId?: string;
}

export function ReleasePanel({
  isOpen,
  onClose,
  initialView = 'list',
  initialReleaseId,
}: ReleasePanelProps) {
  const [currentView, setCurrentView] = useState<ViewMode>(initialView);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    initialReleaseId || null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: releases = [], isLoading: releasesLoading } = useReleases();

  // Map API release data to ReleaseHistory's expected shape
  const historyReleases = useMemo(
    () =>
      releases.map((r) => {
        const status =
          r.status === 'deployed'
            ? ('released' as const)
            : r.status === 'draft' || r.status === 'scheduled'
              ? ('planned' as const)
              : ('active' as const);
        return {
          id: r.id,
          version: r.version,
          name: r.name,
          status,
          releaseDate: r.released_at ?? r.target_date ?? null,
          createdAt: r.created_at,
          features: (r.features ?? []).map((f) => ({
            id: f.feature_id,
            title: f.title ?? 'Feature',
            status: 'released' as const,
          })),
          releaseNotes: r.release_notes,
        };
      }),
    [releases]
  );

  // Navigation handlers
  const handleViewRelease = useCallback((releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setCurrentView('detail');
  }, []);

  const handleCreateRelease = useCallback(() => {
    setCurrentView('create');
  }, []);

  const handleViewHistory = useCallback(() => {
    setCurrentView('history');
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedReleaseId(null);
    setCurrentView('list');
  }, []);

  // Success handlers that trigger refresh
  const handleReleaseCreated = useCallback((releaseId: string) => {
    setRefreshKey((prev) => prev + 1);
    setSelectedReleaseId(releaseId);
    setCurrentView('detail');
  }, []);

  const handleReleaseUpdated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleReleaseDeleted = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    handleBackToList();
  }, [handleBackToList]);

  // Panel close handler
  const handleClose = useCallback(() => {
    setCurrentView('list');
    setSelectedReleaseId(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <PackageIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Release Manager</h2>
              <p className="text-sm text-gray-500">
                Group features into releases and manage deployments
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center space-x-2">
            {currentView === 'list' && (
              <>
                <button
                  onClick={handleViewHistory}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                >
                  <HistoryIcon className="w-4 h-4" />
                  <span>History</span>
                </button>
                <button
                  onClick={handleCreateRelease}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Create Release</span>
                </button>
              </>
            )}

            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'list' && (
            <ReleaseListView
              onViewRelease={handleViewRelease}
              onCreateRelease={handleCreateRelease}
              refreshKey={refreshKey}
            />
          )}

          {currentView === 'detail' && selectedReleaseId && (
            <ReleaseDetailView
              releaseId={selectedReleaseId}
              onBack={handleBackToList}
              onReleaseUpdated={handleReleaseUpdated}
              onReleaseDeleted={handleReleaseDeleted}
            />
          )}

          {currentView === 'create' && (
            <CreateReleaseForm onBack={handleBackToList} onReleaseCreated={handleReleaseCreated} />
          )}

          {currentView === 'history' && (
            <ReleaseHistory
              releases={historyReleases}
              onReleaseClick={(r) => handleViewRelease(r.id)}
              loading={releasesLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ReleasePanel;
