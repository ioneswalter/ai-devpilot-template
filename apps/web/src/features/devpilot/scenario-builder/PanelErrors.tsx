/**
 * FR-141 — Inline error strip rendered between toolbar and body.
 */

interface PanelErrorsProps {
  errors: Error[];
}

export function PanelErrors({ errors }: PanelErrorsProps) {
  if (errors.length === 0) return null;
  return (
    <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 space-y-1">
      {errors.map((e, i) => (
        <div key={i} className="text-xs text-rose-700">
          {e.message}
        </div>
      ))}
    </div>
  );
}
