/**
 * VersionSelector — Dropdown for switching between feature versions (FR-149 v1.1)
 * Shows all versions with labels and status. Default: current (latest non-superseded).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

interface VersionRecord {
  id: string;
  version_label: string | null;
  version_number: number;
  status: string | null;
  superseded_by: string | null;
  change_summary: string | null;
}

interface VersionSelectorProps {
  featureId: string;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
}

export function VersionSelector({
  featureId,
  selectedVersionId,
  onSelectVersion,
}: VersionSelectorProps) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['feature-versions-selector', featureId],
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_versions')
        .select('id, version_label, version_number, status, superseded_by, change_summary')
        .eq('feature_id', featureId)
        .order('version_number', { ascending: false });
      return (data ?? []) as VersionRecord[];
    },
    staleTime: 30_000,
  });

  if (isLoading || !versions || versions.length === 0) return null;

  const currentVersion = versions.find((v) => v.superseded_by === null);
  const isViewingCurrent = selectedVersionId === null || selectedVersionId === currentVersion?.id;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedVersionId ?? currentVersion?.id ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onSelectVersion(val === currentVersion?.id ? null : val);
        }}
        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.version_label ?? `v${v.version_number}`}
            {v.superseded_by === null ? ' (current)' : ''}
            {v.status ? ` — ${v.status}` : ''}
          </option>
        ))}
      </select>
      {!isViewingCurrent && (
        <button
          onClick={() => onSelectVersion(null)}
          className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
        >
          Back to current
        </button>
      )}
    </div>
  );
}
