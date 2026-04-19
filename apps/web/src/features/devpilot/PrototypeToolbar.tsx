/**
 * PrototypeToolbar — controls above the prototype preview iframe.
 * Shows version indicator, history toggle, fullscreen toggle, and finalise button.
 * FR-140: AI Prototype Builder
 */

import { useState } from 'react';
import type { PrototypeType } from '@ownyourgig/types';

interface VersionInfo {
  id: string;
  version_number: number;
  prototype_type: string;
  content: string;
  feedback_prompt: string | null;
  is_current: boolean;
  confidence: number | null;
  created_at: string;
}
import { PrototypeVersionHistory } from './PrototypeVersionHistory';

const TYPE_LABELS: Record<PrototypeType, string> = {
  ui: '🖥️ UI Screens',
  flowchart: '🔀 Flowchart',
  sequence: '⚙️ Sequence',
};

interface PrototypeToolbarProps {
  prototypeType: PrototypeType | null;
  versionNumber: number;
  totalVersions: number;
  versions: VersionInfo[];
  onRevert: (versionId: string) => void;
  isReverting: boolean;
  onFinalise?: () => void;
  isFinalised?: boolean;
}

export function PrototypeToolbar({
  prototypeType,
  versionNumber,
  totalVersions,
  versions,
  onRevert,
  isReverting,
  onFinalise,
  isFinalised,
}: PrototypeToolbarProps) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">Prototype Preview</span>
          {prototypeType && (
            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
              {TYPE_LABELS[prototypeType]}
            </span>
          )}
          <span className="text-gray-400">
            v{versionNumber}{totalVersions > 1 ? ` of ${totalVersions}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {totalVersions > 1 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${showHistory ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              History ({totalVersions})
            </button>
          )}
          {onFinalise && !isFinalised && (
            <button
              onClick={onFinalise}
              className="px-2 py-1 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
            >
              Finalise
            </button>
          )}
          {isFinalised && (
            <span className="px-2 py-1 text-[11px] font-medium text-emerald-600">
              ✓ Finalised
            </span>
          )}
        </div>
      </div>

      {/* Version history dropdown */}
      {showHistory && (
        <div className="absolute right-0 top-full z-10 w-64 bg-white border rounded-b-lg shadow-lg">
          <PrototypeVersionHistory
            versions={versions}
            currentVersionNumber={versionNumber}
            onRevert={(id) => { onRevert(id); setShowHistory(false); }}
            isReverting={isReverting}
          />
        </div>
      )}
    </div>
  );
}
