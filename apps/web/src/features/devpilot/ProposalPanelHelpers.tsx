/**
 * ProposalPanelHelpers — Utilities and sub-components extracted from ProposalPanel.
 */

import { useState, useEffect } from 'react';
import { CheckCircleIcon } from './icons';
import { supabase } from '@/lib/supabase-client';
import { initJourneyForm } from './ProposalFormFields';
import type { ProposalFormState } from './ProposalFormFields';
import type { AdminProposal, MemberProposal } from './types';

export function useAvailableSections() {
  const [sections, setSections] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from('product_features')
      .select('spec_section')
      .not('spec_section', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map((r: { spec_section: string }) => r.spec_section))].sort();
          setSections(unique);
        }
      });
  }, []);
  return sections;
}

export function initFormState(p: AdminProposal | MemberProposal): ProposalFormState {
  return {
    title: p.title,
    description: p.description,
    criteria: (p.acceptance_criteria ?? []).join('\n'),
    priority: 'priority' in p ? p.priority : 'P3',
    category: 'category' in p ? (p.category ? p.category : '') : '',
    specSection: 'spec_section' in p ? p.spec_section : 'Community Proposals',
    submitted: false,
    submittedCode: null,
    journeys: p.journeys ? p.journeys.map(initJourneyForm) : [],
    testCases: p.test_cases ?? [],
  };
}

interface ProposalTabsProps {
  forms: ProposalFormState[];
  activeIndex: number;
  onSelectTab: (index: number) => void;
  onMoveForm: (from: number, to: number) => void;
}

export function ProposalTabs({ forms, activeIndex, onSelectTab, onMoveForm }: ProposalTabsProps) {
  return (
    <div className="flex border-b px-2 pt-2 gap-1 overflow-x-auto items-end">
      {forms.map((f, i) => (
        <div key={i} className="flex items-center">
          {i === activeIndex && i > 0 && !f.submitted && (
            <button
              onClick={() => onMoveForm(i, i - 1)}
              className="px-1 py-1 text-gray-400 hover:text-gray-700 text-xs"
              title="Move left"
            >
              &larr;
            </button>
          )}
          <button
            onClick={() => onSelectTab(i)}
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
              onClick={() => onMoveForm(i, i + 1)}
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
