/**
 * Tab bar for multi-proposal navigation in ProposalPanel.
 */

import { CheckCircleIcon } from './icons';

interface ProposalFormState {
  title: string;
  submitted: boolean;
  submittedCode: string | null;
}

interface ProposalPanelTabsProps {
  forms: ProposalFormState[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

export function ProposalPanelTabs({ forms, activeIndex, onSelect, onMove }: ProposalPanelTabsProps) {
  return (
    <div className="flex border-b px-2 pt-2 gap-1 overflow-x-auto items-end">
      {forms.map((f, i) => (
        <div key={i} className="flex items-center">
          {i === activeIndex && i > 0 && !f.submitted && (
            <button
              onClick={() => onMove(i, i - 1)}
              className="px-1 py-1 text-gray-400 hover:text-gray-700 text-xs"
              title="Move left"
            >
              &larr;
            </button>
          )}
          <button
            onClick={() => onSelect(i)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border border-b-0 whitespace-nowrap transition-colors ${
              i === activeIndex
                ? 'bg-white text-gray-900 border-gray-300'
                : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {f.submitted && <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />}
            <span className="truncate max-w-[120px]">{f.title || `Feature ${i + 1}`}</span>
            {f.submittedCode && (
              <span className="font-mono text-[10px] text-emerald-600">{f.submittedCode}</span>
            )}
          </button>
          {i === activeIndex && i < forms.length - 1 && !f.submitted && (
            <button
              onClick={() => onMove(i, i + 1)}
              className="px-1 py-1 text-gray-400 hover:text-gray-700 text-xs"
              title="Move right"
            >
              &rarr;
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
