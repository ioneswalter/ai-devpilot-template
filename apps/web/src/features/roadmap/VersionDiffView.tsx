/**
 * VersionDiffView — Side-by-side comparison of two feature versions (FR-149)
 */

import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/lib/api/product-api';

interface VersionDiffViewProps {
  v1Id: string;
  v2Id: string;
  onClose: () => void;
}

export function VersionDiffView({ v1Id, v2Id, onClose }: VersionDiffViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['version-compare', v1Id, v2Id],
    queryFn: () => productApi.compareVersions(v1Id, v2Id),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="p-4 text-xs text-gray-400">Loading comparison...</div>;
  }

  if (error || !data?.data) {
    return (
      <div className="p-4">
        <p className="text-xs text-red-500">Failed to load comparison</p>
        <button onClick={onClose} className="mt-2 text-xs text-gray-500 hover:text-gray-700">Close</button>
      </div>
    );
  }

  const { v1, v2, diff } = data.data;

  return (
    <div className="mt-3 border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
        <span className="text-xs font-medium text-gray-700">
          Comparing {v1.version_label} vs {v2.version_label}
        </span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
      </div>

      <div className="p-3 space-y-3">
        <DiffField
          label="Title"
          changed={diff.title.changed}
          oldValue={v1.title}
          newValue={v2.title}
        />

        <DiffField
          label="Description"
          changed={diff.description.changed}
          oldValue={v1.description ?? ''}
          newValue={v2.description ?? ''}
        />

        <div>
          <span className="text-xs font-medium text-gray-700">Acceptance Criteria</span>
          {diff.acceptance_criteria.unchanged.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {diff.acceptance_criteria.unchanged.map((c, i) => (
                <p key={`u-${i}`} className="text-xs text-gray-500 pl-3 border-l-2 border-gray-200 py-0.5">
                  {c}
                </p>
              ))}
            </div>
          )}
          {diff.acceptance_criteria.added.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {diff.acceptance_criteria.added.map((c, i) => (
                <p key={`a-${i}`} className="text-xs text-green-700 bg-green-50 pl-3 border-l-2 border-green-400 py-0.5 rounded-r">
                  + {c}
                </p>
              ))}
            </div>
          )}
          {diff.acceptance_criteria.removed.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {diff.acceptance_criteria.removed.map((c, i) => (
                <p key={`r-${i}`} className="text-xs text-red-700 bg-red-50 pl-3 border-l-2 border-red-400 py-0.5 rounded-r line-through">
                  - {c}
                </p>
              ))}
            </div>
          )}
          {diff.acceptance_criteria.added.length === 0 &&
           diff.acceptance_criteria.removed.length === 0 && (
            <p className="text-[10px] text-gray-400 mt-1">No changes</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffField({ label, changed, oldValue, newValue }: {
  label: string;
  changed: boolean;
  oldValue: string;
  newValue: string;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {changed ? (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <p className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200 line-through">{oldValue}</p>
          <p className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">{newValue}</p>
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 mt-0.5">No changes</p>
      )}
    </div>
  );
}
