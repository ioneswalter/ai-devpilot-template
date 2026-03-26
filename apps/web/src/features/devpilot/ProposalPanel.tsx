/**
 * ProposalPanel — Side panel for reviewing and editing AI-generated proposals
 * Supports single or multiple proposals (scope-split by AI)
 * Shows role-appropriate fields: simplified for members, full for admins
 */

import { useState, useEffect } from 'react';
import { SendIcon, XIcon, LoaderIcon, CheckCircleIcon } from './icons';
import { DeduplicationWarning } from './DeduplicationWarning';
import { ProposalFormFields, initJourneyForm } from './ProposalFormFields';
import type { ProposalFormState } from './ProposalFormFields';
import { devpilotApi } from '@/lib/api-client';
import { supabase } from '@/lib/supabase-client';
import type { AdminProposal, MemberProposal, SubmitProposalResponse } from './types';

function useAvailableSections() {
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

interface ProposalPanelProps {
  proposal: AdminProposal | MemberProposal;
  proposals?: Array<AdminProposal | MemberProposal>;
  conversationId: string;
  isAdmin: boolean;
  onClose: () => void;
  onSubmitted: (results: SubmitProposalResponse[]) => void;
}

function initFormState(p: AdminProposal | MemberProposal): ProposalFormState {
  return {
    title: p.title,
    description: p.description,
    criteria: p.acceptance_criteria.join('\n'),
    priority: 'priority' in p ? p.priority : 'P3',
    category: 'category' in p ? (p.category ?? '') : '',
    specSection: 'spec_section' in p ? p.spec_section : 'Community Proposals',
    submitted: false,
    submittedCode: null,
    journeys: p.journeys ? p.journeys.map(initJourneyForm) : [],
    edgeCases: 'edge_cases' in p && p.edge_cases ? p.edge_cases.join('\n') : '',
    successCriteria: 'success_criteria' in p && p.success_criteria ? p.success_criteria.join('\n') : '',
  };
}

export function ProposalPanel({
  proposal,
  proposals: proposalsProp,
  conversationId,
  isAdmin,
  onClose,
  onSubmitted,
}: ProposalPanelProps) {
  const allProposals = proposalsProp && proposalsProp.length > 0 ? proposalsProp : [proposal];
  const isMulti = allProposals.length > 1;
  const availableSections = useAvailableSections();

  const [activeIndex, setActiveIndex] = useState(0);
  const [forms, setForms] = useState<ProposalFormState[]>(allProposals.map(initFormState));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dedupResult, setDedupResult] = useState<SubmitProposalResponse | null>(null);

  useEffect(() => {
    const newProposals = proposalsProp && proposalsProp.length > 0 ? proposalsProp : [proposal];
    const newForms = newProposals.map(initFormState);
    setForms(newForms);
    setActiveIndex(0);

    if (conversationId && conversationId !== 'pending') {
      supabase
        .from('product_features')
        .select('feature_code, title')
        .eq('ideation_conversation_id', conversationId)
        .then(({ data: features }) => {
          if (features && features.length > 0) {
            setForms((prev) =>
              prev.map((f) => {
                const match = features.find((feat) => feat.title === f.title);
                return match
                  ? { ...f, submitted: true, submittedCode: match.feature_code }
                  : f;
              })
            );
          }
        });
    }
  }, [proposal, proposalsProp, conversationId]);

  const updateForm = (index: number, updates: Partial<ProposalFormState>) => {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const moveForm = (from: number, to: number) => {
    setForms((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setActiveIndex(to);
  };

  const form = forms[activeIndex];
  const submittedCount = forms.filter((f) => f.submitted).length;
  const allSubmitted = submittedCount === forms.length;

  const handleSubmitAll = async () => {
    setIsSubmitting(true);
    setError(null);

    const unsubmittedForms = forms.map((f, i) => ({ form: f, index: i })).filter(({ form: f }) => !f.submitted);
    const allResults: SubmitProposalResponse[] = [];
    let firstDedupResult: SubmitProposalResponse | null = null;

    for (const { form: f, index } of unsubmittedForms) {
      // Build criteria from journeys if available, else from flat criteria
      const hasJourneys = f.journeys.length > 0;
      const criteriaArray = hasJourneys
        ? f.journeys.flatMap((j) =>
            j.acceptance_scenarios.split('\n').map((s) => s.trim()).filter(Boolean)
          )
        : f.criteria.split('\n').map((c) => c.trim()).filter(Boolean);

      const proposalData: Record<string, unknown> = {
        title: f.title,
        description: f.description,
        acceptance_criteria: criteriaArray,
      };

      // Include SpecKit journey data for spec.md generation
      if (hasJourneys) {
        proposalData.journeys = f.journeys.map((j) => ({
          title: j.title,
          priority: j.priority,
          description: j.description,
          why_priority: j.why_priority,
          independent_test: j.independent_test,
          acceptance_scenarios: j.acceptance_scenarios.split('\n').map((s: string) => s.trim()).filter(Boolean),
        }));
        proposalData.edge_cases = f.edgeCases.split('\n').map((e: string) => e.trim()).filter(Boolean);
        proposalData.success_criteria = f.successCriteria.split('\n').map((s: string) => s.trim()).filter(Boolean);
      }

      if (isAdmin) {
        proposalData.priority = f.priority;
        proposalData.category = f.category || null;
        proposalData.spec_section = f.specSection;
      }

      try {
        const response = await devpilotApi.submitProposal(conversationId, proposalData);
        const result = response.data as SubmitProposalResponse;

        if (!result.dedup_check.passed && !firstDedupResult) {
          firstDedupResult = result;
        }
        updateForm(index, { submitted: true, submittedCode: result.feature.feature_code });
        allResults.push(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to submit "${f.title}"`);
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);

    if (firstDedupResult) {
      setDedupResult(firstDedupResult);
    } else if (allResults.length > 0) {
      onSubmitted(allResults);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l">
      {dedupResult && (
        <DeduplicationWarning
          matches={dedupResult.dedup_check.matches}
          onSubmitAnyway={() => {
            setDedupResult(null);
            onSubmitted([dedupResult]);
          }}
          onCancel={() => setDedupResult(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">
          {isMulti ? `Proposals (${submittedCount}/${forms.length})` : 'Proposal'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs for multiple proposals */}
      {isMulti && (
        <div className="flex border-b px-2 pt-2 gap-1 overflow-x-auto items-end">
          {forms.map((f, i) => (
            <div key={i} className="flex items-center">
              {i === activeIndex && i > 0 && !f.submitted && (
                <button
                  onClick={() => moveForm(i, i - 1)}
                  className="px-1 py-1 text-gray-400 hover:text-gray-700 text-xs"
                  title="Move left"
                >
                  &larr;
                </button>
              )}
              <button
                onClick={() => setActiveIndex(i)}
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
                  onClick={() => moveForm(i, i + 1)}
                  className="px-1 py-1 text-gray-400 hover:text-gray-700 text-xs"
                  title="Move right"
                >
                  &rarr;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <ProposalFormFields
          form={form}
          isAdmin={isAdmin}
          onUpdate={(updates) => updateForm(activeIndex, updates)}
          availableSections={availableSections}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Submit button */}
      {!allSubmitted && (
        <div className="border-t px-4 py-3">
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitting || forms.some((f) => !f.submitted && (!f.title.trim() || !f.description.trim()))}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {isSubmitting ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                {isMulti
                  ? `Submit All ${forms.length - submittedCount} Features`
                  : 'Submit Proposal'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
