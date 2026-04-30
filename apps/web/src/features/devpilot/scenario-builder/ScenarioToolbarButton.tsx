/**
 * FR-141 — Toolbar entry-point button for the UAT Scenario Builder.
 * Rendered in the DevPilot chat-view header next to "View Proposal".
 */

interface ScenarioToolbarButtonProps {
  onOpen: () => void;
}

export function ScenarioToolbarButton({ onOpen }: ScenarioToolbarButtonProps) {
  return (
    <button
      onClick={onOpen}
      className="px-3 py-2 bg-white text-emerald-700 border border-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-50"
      aria-label="Open UAT Scenario Builder"
    >
      ✨ Define UAT Scenarios
    </button>
  );
}
