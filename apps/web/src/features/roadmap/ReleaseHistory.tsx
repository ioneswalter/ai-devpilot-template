/**
 * ReleaseHistory - Timeline view of past releases showing version, name, date,
 * feature count, and status badge. Clicking a release opens detail in ReleasePanel.
 */

import { useState, type FC } from 'react';

const CalendarIcon = ({ className = '' }: { className?: string }) => (
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
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const PackageIcon = ({ className = '' }: { className?: string }) => (
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
    <path d="m16.5 9.4-9-5.19" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);
const UsersIcon = ({ className = '' }: { className?: string }) => (
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
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const ClockIcon = ({ className = '' }: { className?: string }) => (
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
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const CheckCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const CircleIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
);
const PlayCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" />
  </svg>
);

interface Feature {
  id: string;
  title: string;
  status: 'planned' | 'in-progress' | 'testing' | 'released';
}

interface Release {
  id: string;
  version: string;
  name: string;
  status: 'planned' | 'active' | 'released';
  releaseDate: string | null;
  createdAt: string;
  features: Feature[];
  releaseNotes?: string;
}

interface ReleaseHistoryProps {
  releases: Release[];
  onReleaseClick: (release: Release) => void;
  loading?: boolean;
}

const StatusBadge: FC<{ status: Release['status'] }> = ({ status }) => {
  const config: Record<
    Release['status'],
    { icon: FC<{ className?: string }>; label: string; className: string }
  > = {
    planned: {
      icon: CircleIcon,
      label: 'Planned',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    active: {
      icon: PlayCircleIcon,
      label: 'Active',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    released: {
      icon: CheckCircleIcon,
      label: 'Released',
      className: 'bg-green-100 text-green-700 border-green-200',
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full ${className}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

const ReleaseCard: FC<{
  release: Release;
  onClick: () => void;
}> = ({ release, onClick }) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const featureCount = release.features.length;
  const releasedFeatures = release.features.filter((f) => f.status === 'released').length;

  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600">
              {release.version}
            </h3>
            <StatusBadge status={release.status} />
          </div>
          <h4 className="text-slate-700 font-medium mb-1">{release.name}</h4>
        </div>
        <PackageIcon className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
      </div>

      <div className="flex items-center gap-6 text-sm text-slate-600 mb-4">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-4 h-4" />
          <span>
            {release.status === 'released' && release.releaseDate
              ? formatDate(release.releaseDate)
              : release.status === 'planned'
                ? formatDate(release.releaseDate)
                : 'In progress'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <UsersIcon className="w-4 h-4" />
          <span>
            {release.status === 'released'
              ? `${featureCount} features`
              : `${releasedFeatures}/${featureCount} features ready`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ClockIcon className="w-4 h-4" />
          <span>{formatDate(release.createdAt)}</span>
        </div>
      </div>

      {release.releaseNotes && (
        <p className="text-sm text-slate-600 line-clamp-2">{release.releaseNotes}</p>
      )}
    </div>
  );
};

const ReleaseHistorySkeleton: FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-6 bg-slate-200 rounded w-16 animate-pulse" />
              <div className="h-6 bg-slate-200 rounded w-20 animate-pulse" />
            </div>
            <div className="h-5 bg-slate-200 rounded w-32 animate-pulse mb-1" />
          </div>
          <div className="h-5 w-5 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-6 mb-4">
          <div className="h-4 bg-slate-200 rounded w-24 animate-pulse" />
          <div className="h-4 bg-slate-200 rounded w-28 animate-pulse" />
          <div className="h-4 bg-slate-200 rounded w-20 animate-pulse" />
        </div>
        <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse" />
      </div>
    ))}
  </div>
);

export const ReleaseHistory: FC<ReleaseHistoryProps> = ({
  releases,
  onReleaseClick,
  loading = false,
}) => {
  const [filter, setFilter] = useState<Release['status'] | 'all'>('all');

  const filteredReleases = releases.filter(
    (release) => filter === 'all' || release.status === filter
  );

  // Sort by release date (released first), then by created date
  const sortedReleases = [...filteredReleases].sort((a, b) => {
    if (a.status === 'released' && b.status !== 'released') return -1;
    if (b.status === 'released' && a.status !== 'released') return 1;

    if (a.releaseDate && b.releaseDate) {
      return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (loading) {
    return <ReleaseHistorySkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['all', 'released', 'active', 'planned'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === status
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-1.5 text-xs text-slate-500">
              (
              {status === 'all'
                ? releases.length
                : releases.filter((r) => r.status === status).length}
              )
            </span>
          </button>
        ))}
      </div>

      {/* Release list */}
      {sortedReleases.length === 0 ? (
        <div className="text-center py-12">
          <PackageIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {filter === 'all' ? 'No releases yet' : `No ${filter} releases`}
          </h3>
          <p className="text-slate-600">
            {filter === 'all'
              ? 'Create your first release to get started.'
              : `There are no releases with ${filter} status.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedReleases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              onClick={() => onReleaseClick(release)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ReleaseHistory;
