/**
 * PrototypeVersionHistory — collapsible sidebar showing all prototype versions
 * with timestamps, feedback prompts, and revert buttons.
 * FR-140: AI Prototype Builder
 */

import type { PrototypeVersion } from '@ownyourgig/types';

interface PrototypeVersionHistoryProps {
  versions: PrototypeVersion[];
  currentVersionNumber: number;
  onRevert: (versionId: string) => void;
  isReverting: boolean;
}

export function PrototypeVersionHistory({
  versions,
  currentVersionNumber,
  onRevert,
  isReverting,
}: PrototypeVersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-400 text-center">
        No versions yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[400px]">
      {[...versions].reverse().map((v) => {
        const isCurrent = v.version_number === currentVersionNumber;
        return (
          <div
            key={v.id}
            className={`px-3 py-2 border-b last:border-b-0 ${isCurrent ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-gray-700">
                v{v.version_number}
                {isCurrent && (
                  <span className="ml-1.5 px-1 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">
                    current
                  </span>
                )}
              </span>
              {!isCurrent && (
                <button
                  onClick={() => onRevert(v.id)}
                  disabled={isReverting}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                >
                  Revert
                </button>
              )}
            </div>
            {v.feedback_prompt && (
              <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">
                &ldquo;{v.feedback_prompt}&rdquo;
              </p>
            )}
            <p className="text-[10px] text-gray-400 mt-0.5">
              {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
