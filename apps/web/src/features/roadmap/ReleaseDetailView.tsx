/**
 * ReleaseDetailView - Shows release details with features, notes, and deploy action
 * Displays version, status, feature list, and release notes with edit capability
 */

import { useState } from 'react'
import { useReleases, useDeployRelease, type Release } from './useReleases'
import { ReleaseFeatureList } from './ReleaseFeatureList'
import { ReleaseNotesEditor } from './ReleaseNotesEditor'

const ArrowLeftIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
)
const RocketIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
)
const LoaderIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
)

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', className: 'bg-blue-100 text-blue-700' },
  deployed: { label: 'Deployed', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  rolled_back: { label: 'Rolled Back', className: 'bg-amber-100 text-amber-700' },
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ReleaseDetailViewProps {
  releaseId: string
  onBack: () => void
  onReleaseUpdated: () => void
  onReleaseDeleted: () => void
}

export function ReleaseDetailView({
  releaseId,
  onBack,
  onReleaseUpdated,
}: ReleaseDetailViewProps) {
  const { data: releases, isLoading } = useReleases()
  const deployMutation = useDeployRelease()
  const [showNotes, setShowNotes] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  const release: Release | undefined = releases?.find(r => r.id === releaseId)

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <LoaderIcon className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!release) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500 mb-4">Release not found</p>
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          Back to releases
        </button>
      </div>
    )
  }

  const config = statusConfig[release.status] ?? statusConfig.draft
  const canDeploy = release.status === 'draft' || release.status === 'ready' || release.status === 'scheduled'
  const featureIds = release.features?.map(f => f.feature_id) ?? []

  const handleDeploy = async () => {
    setDeployError(null)
    try {
      await deployMutation.mutateAsync({ id: releaseId })
      onReleaseUpdated()
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed')
    }
  }

  return (
    <div className="p-6 overflow-y-auto max-h-[70vh]">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to releases
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900">{release.name}</h3>
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${config.className}`}>
              {config.label}
            </span>
          </div>
          <span className="font-mono text-sm text-blue-600">v{release.version}</span>
        </div>

        {canDeploy && (
          <button
            onClick={handleDeploy}
            disabled={deployMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {deployMutation.isPending ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <RocketIcon className="w-4 h-4" />
            )}
            {deployMutation.isPending ? 'Deploying...' : 'Deploy Release'}
          </button>
        )}
      </div>

      {deployError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {deployError}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Created</p>
          <p className="text-sm font-medium text-gray-900">{formatDate(release.created_at)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">
            {release.released_at ? 'Deployed' : 'Target Date'}
          </p>
          <p className="text-sm font-medium text-gray-900">
            {formatDate(release.released_at || release.target_date)}
          </p>
        </div>
      </div>

      {release.description && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
          <p className="text-sm text-gray-600">{release.description}</p>
        </div>
      )}

      {/* Features */}
      <div className="mb-6">
        <ReleaseFeatureList
          release={{
            id: release.id,
            name: release.name,
            version: release.version,
            status: release.status as 'draft' | 'scheduled' | 'deployed' | 'rolled_back',
            features: (release.features ?? []).map(f => ({
              id: f.feature_id,
              feature_code: f.feature_code ?? f.feature_id.slice(0, 8),
              title: f.title ?? 'Unknown Feature',
              status: (f.status ?? 'released') as 'released',
            })),
          }}
        />
      </div>

      {/* Release Notes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Release Notes</h4>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showNotes ? 'Hide' : release.release_notes ? 'Edit' : 'Add Notes'}
          </button>
        </div>

        {!showNotes && release.release_notes && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
            {release.release_notes}
          </div>
        )}

        {showNotes && (
          <ReleaseNotesEditor
            releaseId={releaseId}
            initialNotes={release.release_notes ?? ''}
            featureIds={featureIds}
          />
        )}

        {!showNotes && !release.release_notes && (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-500">No release notes yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
