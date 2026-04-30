/**
 * FR-141 — Generate / Generate-more button + status pill.
 * Surfaces streaming-pending state, Retry on error.
 */

interface GenerateButtonProps {
  hasExistingScenarios: boolean;
  isGenerating: boolean;
  error: Error | null;
  onGenerate: (mode: 'initial' | 'more') => void;
}

export function GenerateButton({
  hasExistingScenarios,
  isGenerating,
  error,
  onGenerate,
}: GenerateButtonProps) {
  const mode: 'initial' | 'more' = hasExistingScenarios ? 'more' : 'initial';
  const label = isGenerating
    ? 'Generating…'
    : hasExistingScenarios
      ? 'Generate more'
      : 'Generate UAT scenarios';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onGenerate(mode)}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-progress shadow-sm"
        aria-label={label}
      >
        {isGenerating ? (
          <span className="h-3 w-3 rounded-full border-2 border-white border-r-transparent animate-spin" />
        ) : (
          <span aria-hidden="true">✨</span>
        )}
        {label}
      </button>
      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          <span className="truncate">{error.message}</span>
          <button
            type="button"
            onClick={() => onGenerate(mode)}
            className="ml-auto px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
