/**
 * FR-141 — Visual region of a step card. Icon + step number; falls back to icon-only
 * when no prototype thumbnail is available. Prototype thumbnail integration is a future
 * polish item (R3 — visual region renders categorical icon for v1).
 */

interface StepVisualProps {
  scenarioType: 'happy_path' | 'edge_case';
  stepNumber: number;
}

const PALETTE: Record<
  'happy_path' | 'edge_case',
  { bg: string; ring: string; text: string; label: string }
> = {
  happy_path: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    text: 'text-emerald-700',
    label: 'Happy step',
  },
  edge_case: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
    label: 'Edge step',
  },
};

export function StepVisual({ scenarioType, stepNumber }: StepVisualProps) {
  const p = PALETTE[scenarioType];
  return (
    <div className={`h-24 ${p.bg} ring-1 ring-inset ${p.ring} flex items-center justify-center`}>
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full bg-white flex items-center justify-center text-sm font-bold ${p.text}`}
          aria-label={`Step ${stepNumber}`}
        >
          {stepNumber}
        </div>
        <span className={`mt-1 text-[10px] uppercase tracking-wide ${p.text}`}>{p.label}</span>
      </div>
    </div>
  );
}
