/**
 * VersionHistoryPanel — Collapsible panel listing all versions of a feature (FR-149)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productApi, type FeatureVersionDB } from '@/lib/api/product-api';
import { VersionDiffView } from './VersionDiffView';
import { getStatusBadge } from '@/components/roadmap/badge-utils';

interface VersionHistoryPanelProps {
  featureId: string;
}

export function VersionHistoryPanel({ featureId }: VersionHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showDiff, setShowDiff] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['feature-versions', featureId],
    queryFn: () => productApi.getVersions(featureId),
    enabled: isOpen,
    staleTime: 15_000,
  });

  const versions = data?.data?.versions ?? [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  if (versions.length === 0 && !isLoading && isOpen) {
    return (
      <div className="border-t pt-3 mt-3">
        <button
          onClick={() => setIsOpen(false)}
          className="text-sm font-medium text-gray-700 flex items-center gap-1"
        >
          <ChevronIcon open={true} /> Version History
        </button>
        <p className="text-xs text-gray-400 mt-2 ml-5">No version history available.</p>
      </div>
    );
  }

  return (
    <div className="border-t pt-3 mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm font-medium text-gray-700 flex items-center gap-1 hover:text-gray-900"
      >
        <ChevronIcon open={isOpen} />
        Version History
        {versions.length > 0 && (
          <span className="text-xs text-gray-400 font-normal ml-1">({versions.length})</span>
        )}
      </button>

      {isOpen && (
        <div className="mt-2 ml-5 space-y-1">
          {isLoading && <p className="text-xs text-gray-400">Loading versions...</p>}
          {error && <p className="text-xs text-red-500">Failed to load versions</p>}

          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              isSelected={selected.includes(v.id)}
              onToggle={() => toggleSelect(v.id)}
            />
          ))}

          {selected.length === 2 && !showDiff && (
            <button
              onClick={() => setShowDiff(true)}
              className="mt-2 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Compare Selected
            </button>
          )}

          {showDiff && selected.length === 2 && (
            <VersionDiffView
              v1Id={selected[0]}
              v2Id={selected[1]}
              onClose={() => {
                setShowDiff(false);
                setSelected([]);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function VersionRow({
  version,
  isSelected,
  onToggle,
}: {
  version: FeatureVersionDB;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const date = new Date(version.created_at).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <label
      className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-gray-900">
            {version.version_label ?? `v${version.version_number}`}
          </span>
          {version.status && getStatusBadge(version.status)}
          {version.superseded_by && <span className="text-[10px] text-gray-400">archived</span>}
        </div>
        {version.change_summary && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{version.change_summary}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5">{date}</p>
      </div>
    </label>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
