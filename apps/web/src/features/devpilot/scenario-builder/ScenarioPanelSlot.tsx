/**
 * FR-141 — Side-panel slot rendered next to the chat when the BP opens the
 * Scenario Builder. Hides when no active conversation. Keeps the route file
 * size budget tight (Constitution VI).
 */

import { ScenarioBuilderPanel } from './ScenarioBuilderPanel';

interface ScenarioPanelSlotProps {
  conversationId: string | null;
  onClose: () => void;
}

export function ScenarioPanelSlot({ conversationId, onClose }: ScenarioPanelSlotProps) {
  if (!conversationId || conversationId === 'pending') return null;
  return (
    <div className="w-1/2 min-w-[360px] border-l border-gray-200">
      <ScenarioBuilderPanel conversationId={conversationId} onClose={onClose} />
    </div>
  );
}
