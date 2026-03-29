/**
 * ReleaseListView - Displays all releases in a card grid with status badges
 * Shows draft, scheduled, and deployed releases with feature counts
 */

import { useReleases, type Release } from './useReleases'

const PackageIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
)

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', className: 'bg-blue-100 text-blue-700' },
  deployed: { label: 'Deployed', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  rolled_back: { label: 'Rolled Back', className: 'bg-amber-100 text-amber-700' },
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.className}`}>
      {config.label}
    </span>
  )
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ReleaseCard({
  release,
  onClick,
}: {
  release: Release
  onClick: () => void
}) {
  const featureCount = release.features?.length ?? 0

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold text-blue-600">
              v{release.version}
            </span>
            <StatusBadge status={release.status} />
          </div>
          <h3 className="text-base font-medium text-gray-900 group-hover:text-blue-600">
            {release.name}
          </h3>
        </div>
        <PackageIcon className="w-5 h-5 text-gray-300 group-hover:text-gray-500" />
      </div>

      {release.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{release.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{featureCount} feature{featureCount !== 1 ? 's' : ''}</span>
        {release.released_at && <span>Deployed {formatDate(release.released_at)}</span>}
        {!release.released_at && release.target_date && (
          <span>Scheduled {formatDate(release.target_date)}</span>
        )}
        {!release.released_at && !release.target_date && (
          <span>Created {formatDate(release.created_at)}</span>
        )}
      </div>
    </div>
  )
}

interface ReleaseListViewProps {
  onViewRelease: (id: string) => void
  onCreateRelease: () => void
  refreshKey?: number
}

export function ReleaseListView({
  onViewRelease,
  onCreateRelease,
}: ReleaseListViewProps) {
  const { data: releases, isLoading, isFetching, error } = useReleases()

  if (isLoading || isFetching) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-5 w-16 bg-gray-200 rounded" />
              <div className="h-5 w-20 bg-gray-200 rounded-full" />
            </div>
            <div className="h-5 w-48 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 mb-2">Failed to load releases</p>
        <p className="text-xs text-gray-500">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    )
  }

  if (!releases || releases.length === 0) {
    return (
      <div className="p-12 text-center">
        <PackageIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No releases yet</h3>
        <p className="text-sm text-gray-500 mb-6">
          Create your first release to group completed features for deployment.
        </p>
        <button
          onClick={onCreateRelease}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create First Release
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-3 overflow-y-auto max-h-[65vh]">
      {releases.map((release) => (
        <ReleaseCard
          key={release.id}
          release={release}
          onClick={() => onViewRelease(release.id)}
        />
      ))}
    </div>
  )
}
