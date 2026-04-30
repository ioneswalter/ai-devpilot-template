/**
 * FR-141 — Header for the Scenario Builder panel: title, summary stats, close.
 */

interface PanelHeaderProps {
  draftCount: number;
  curatedCount: number;
  pendingCount: number;
  onClose: () => void;
}

export function PanelHeader({ draftCount, curatedCount, pendingCount, onClose }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <div>
        <h2 className="text-base font-semibold text-gray-900">UAT Scenario Builder</h2>
        <p className="text-xs text-gray-500">
          {draftCount} draft · {curatedCount} curated · {pendingCount} pending decisions
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600"
        aria-label="Close scenario builder"
      >
        ✕
      </button>
    </div>
  );
}
