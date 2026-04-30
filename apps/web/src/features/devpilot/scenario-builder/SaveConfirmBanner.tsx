/**
 * FR-141 — Inline banner shown when the BP clicks Save with pending steps still present.
 * Asks whether to accept or reject the remaining pending decisions.
 */

interface SaveConfirmBannerProps {
  pendingCount: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCancel: () => void;
}

export function SaveConfirmBanner({ pendingCount, onAcceptAll, onRejectAll, onCancel }: SaveConfirmBannerProps) {
  return (
    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 flex items-center gap-3">
      <span>
        {pendingCount} step{pendingCount === 1 ? '' : 's'} are still pending. What should happen to them on save?
      </span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onAcceptAll} className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">Accept all pending</button>
        <button type="button" onClick={onRejectAll} className="px-3 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700">Reject all pending</button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
      </div>
    </div>
  );
}
