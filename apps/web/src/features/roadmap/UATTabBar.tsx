/**
 * UATTabBar — tab strip for the UAT review panel (FR-130 v2.0 / J12, T048).
 * Switches between the Review surface and the Cycle history audit view.
 */

interface UATTabBarProps {
  activeTab: 'review' | 'history';
  historyCount: number;
  onChange: (t: 'review' | 'history') => void;
}

export function UATTabBar({ activeTab, historyCount, onChange }: UATTabBarProps) {
  const baseCls = 'px-4 py-2 text-xs font-medium border-b-2 transition-colors';
  const active = 'border-teal-600 text-teal-700';
  const inactive = 'border-transparent text-gray-500 hover:text-gray-700';
  return (
    <div className="flex border-b border-gray-200 bg-white" role="tablist" aria-label="UAT panel tabs">
      <button type="button" role="tab" aria-selected={activeTab === 'review'}
        className={`${baseCls} ${activeTab === 'review' ? active : inactive}`}
        onClick={() => onChange('review')} data-testid="uat-tab-review">
        Review
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'history'}
        className={`${baseCls} ${activeTab === 'history' ? active : inactive}`}
        onClick={() => onChange('history')} data-testid="uat-tab-history">
        Cycle history{historyCount > 0 ? ` (${historyCount})` : ''}
      </button>
    </div>
  );
}
