/**
 * ProposalPanel — Side panel for reviewing and editing AI-generated proposals
 * Supports single or multiple proposals (scope-split by AI)
 * Shows role-appropriate fields: simplified for members, full for admins
 */

import { useState, useEffect } from 'react';
import { SendIcon, XIcon, LoaderIcon } from './icons';
import { DeduplicationWarning } from './DeduplicationWarning';
import type { DedupDecision } from './DeduplicationWarning';
import { ProposalFormFields, initJourneyForm } from './ProposalFormFields';
import type { ProposalFormState } from './ProposalFormFields';
import { ProposalPanelTabs } from './ProposalPanelTabs';
import { devpilotApi } from '@/lib/api-client';
import { productApi } from '@/lib/api/product-api';
import { supabase } from '@/lib/supabase-client';
import type { AdminProposal, MemberProposal, SubmitProposalResponse } from './types';

function useAvailableSections() {
  const [sections, setSections] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('product_features').select('spec_section').not('spec_section', 'is', null)
      .then(({ data }) => {
        if (data) setSections([...new Set(data.map((r: { spec_section: string }) => r.spec_section))].sort());
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

interface UpdatedFeatureRow {
  id: string;
  feature_code: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
}

function criteriaFromForm(f: ProposalFormState): string[] {
  return f.journeys.length > 0
    ? f.journeys.flatMap((j) => j.acceptance_scenarios.split('\n').map((s) => s.trim()).filter(Boolean))
    : f.criteria.split('\n').map((c) => c.trim()).filter(Boolean);
}

async function deleteThrowawayFeature(featureId: string): Promise<void> {
  const r1 = await supabase.from('test_cases').delete().eq('feature_id', featureId);
  if (r1.error) throw new Error(`Cleanup failed (test_cases): ${r1.error.message}`);
  const r2 = await supabase.from('feature_spec_artifacts').delete().eq('feature_id', featureId);
  if (r2.error) throw new Error(`Cleanup failed (feature_spec_artifacts): ${r2.error.message}`);
  const r3 = await supabase.from('ideation_conversations').update({ submitted_feature_id: null }).eq('submitted_feature_id', featureId);
  if (r3.error) throw new Error(`Cleanup failed (clearing submitted_feature_id): ${r3.error.message}`);
  const r4 = await supabase.from('product_features').delete().eq('id', featureId);
  if (r4.error) throw new Error(`Cleanup failed (product_features): ${r4.error.message}`);
}

async function mergeIntoVersionedFeature(targetCode: string, throwawayId: string, f: ProposalFormState, conversationId: string): Promise<UpdatedFeatureRow> {
  const { data: target, error: fetchErr } = await supabase.from('product_features')
    .select('id, title, description, acceptance_criteria').eq('feature_code', targetCode).single();
  if (fetchErr || !target) throw new Error(`Target feature ${targetCode} not found: ${fetchErr?.message ?? 'no data'}`);
  await productApi.bumpVersion(target.id, 'minor', `New version from Ideation: ${f.title}`);
  const mergedCriteria = [...((target.acceptance_criteria as string[]) ?? []), ...criteriaFromForm(f)];
  const { data: updated, error: updateErr } = await supabase.from('product_features')
    .update({ title: `${target.title} with ${f.title}`, description: `${target.description}\n\n${f.description}`, acceptance_criteria: mergedCriteria, priority: f.priority, updated_at: new Date().toISOString() })
    .eq('id', target.id).select('id, feature_code, title, status, priority, category').single();
  if (updateErr || !updated) throw new Error(`Failed to merge into ${targetCode}: ${updateErr?.message ?? 'no data returned'}`);
  const { error: relinkErr } = await supabase.from('ideation_conversations').update({ submitted_feature_id: updated.id, status: 'submitted' }).eq('id', conversationId);
  if (relinkErr) throw new Error(`Failed to re-link conversation: ${relinkErr.message}`);
  await deleteThrowawayFeature(throwawayId);
  return updated as UpdatedFeatureRow;
}

async function replaceFeatureContent(targetCode: string, throwawayId: string, f: ProposalFormState, conversationId: string): Promise<UpdatedFeatureRow> {
  const { data: updated, error: updateErr } = await supabase.from('product_features')
    .update({ title: f.title, description: f.description, acceptance_criteria: criteriaFromForm(f), priority: f.priority, status: 'proposed', updated_at: new Date().toISOString() })
    .eq('feature_code', targetCode).select('id, feature_code, title, status, priority, category').single();
  if (updateErr || !updated) throw new Error(`Failed to update ${targetCode}: ${updateErr?.message ?? 'no data returned'}`);
  const { error: relinkErr } = await supabase.from('ideation_conversations').update({ submitted_feature_id: updated.id, status: 'submitted' }).eq('id', conversationId);
  if (relinkErr) throw new Error(`Failed to re-link conversation: ${relinkErr.message}`);
  await deleteThrowawayFeature(throwawayId);
  return updated as UpdatedFeatureRow;
}

function initFormState(p: AdminProposal | MemberProposal): ProposalFormState {
  return {
    title: p.title, description: p.description,
    criteria: (p.acceptance_criteria ?? []).join('\n'),
    priority: 'priority' in p ? p.priority : 'P3',
    category: 'category' in p ? (p.category ? p.category : '') : '',
    specSection: 'spec_section' in p ? p.spec_section : 'Community Proposals',
    submitted: false, submittedCode: null,
    journeys: p.journeys ? p.journeys.map(initJourneyForm) : [],
    testCases: p.test_cases ?? [],
  };
}

export function ProposalPanel({
  proposal, proposals: proposalsProp, conversationId, isAdmin, onClose, onSubmitted,
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
    setForms(newProposals.map(initFormState));
    setActiveIndex(0);
    if (conversationId && conversationId !== 'pending') {
      supabase.from('product_features').select('feature_code, title').eq('ideation_conversation_id', conversationId)
        .then(({ data: features }) => {
          if (features?.length) {
            setForms((prev) => prev.map((f) => {
              const match = features.find((feat) => feat.title === f.title);
              return match ? { ...f, submitted: true, submittedCode: match.feature_code } : f;
            }));
          }
        });
    }
  }, [proposal, proposalsProp, conversationId]);

  const updateForm = (index: number, updates: Partial<ProposalFormState>) => {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const moveForm = (from: number, to: number) => {
    setForms((prev) => { const next = [...prev]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; });
    setActiveIndex(to);
  };

  const form = forms[activeIndex];
  const submittedCount = forms.filter((f) => f.submitted).length;
  const allSubmitted = submittedCount === forms.length;

  const handleSubmitAll = async () => {
    setIsSubmitting(true);
    setError(null);
    const unsubmitted = forms.map((f, i) => ({ form: f, index: i })).filter(({ form: f }) => !f.submitted);
    const allResults: SubmitProposalResponse[] = [];
    let firstDedupResult: SubmitProposalResponse | null = null;

    for (const { form: f, index } of unsubmitted) {
      const hasJourneys = f.journeys.length > 0;
      const criteriaArray = hasJourneys
        ? f.journeys.flatMap((j) => j.acceptance_scenarios.split('\n').map((s) => s.trim()).filter(Boolean))
        : f.criteria.split('\n').map((c) => c.trim()).filter(Boolean);
      const proposalData: Record<string, unknown> = { title: f.title, description: f.description, acceptance_criteria: criteriaArray };
      if (hasJourneys) {
        proposalData.journeys = f.journeys.map((j) => ({
          title: j.title, priority: j.priority, description: j.description, why_priority: j.why_priority,
          independent_test: j.independent_test,
          acceptance_scenarios: j.acceptance_scenarios.split('\n').map((s: string) => s.trim()).filter(Boolean),
        }));
      }
      if (f.testCases.length > 0) proposalData.test_cases = f.testCases;
      if (isAdmin) {
        proposalData.priority = f.priority;
        proposalData.category = (f.category && f.category !== 'null') ? f.category : null;
        proposalData.spec_section = f.specSection;
      }
      try {
        const result = (await devpilotApi.submitProposal(conversationId, proposalData)).data as SubmitProposalResponse;
        if (!result.dedup_check.passed && !firstDedupResult) firstDedupResult = result;
        updateForm(index, { submitted: true, submittedCode: result.feature.feature_code });
        allResults.push(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to submit "${f.title}"`);
        setIsSubmitting(false);
        return;
      }
    }
    setIsSubmitting(false);
    if (firstDedupResult) setDedupResult(firstDedupResult);
    else if (allResults.length > 0) onSubmitted(allResults);
  };

  const handleDedupDecision = async (decisions: DedupDecision[]) => {
    if (!dedupResult) return;
    const versionBump = decisions.find((d) => d.action === 'version_bump');
    const useExisting = decisions.find((d) => d.action === 'use_existing' || d.action === 'enhance_existing' || d.action === 'converge');
    const f = forms[activeIndex];
    try {
      if (versionBump) {
        const updated = await mergeIntoVersionedFeature(versionBump.feature_code, dedupResult.feature.id, f, conversationId);
        updateForm(activeIndex, { submitted: true, submittedCode: updated.feature_code });
        setDedupResult(null);
        onSubmitted([{ ...dedupResult, feature: { ...updated, status: updated.status as 'proposed', category: updated.category ?? null } }]);
        return;
      }
      if (useExisting) {
        const updated = await replaceFeatureContent(useExisting.feature_code, dedupResult.feature.id, f, conversationId);
        updateForm(activeIndex, { submitted: true, submittedCode: updated.feature_code });
        setDedupResult(null);
        onSubmitted([{ ...dedupResult, feature: { ...updated, status: 'proposed' as const, category: updated.category ?? null } }]);
        return;
      }
      setDedupResult(null);
      onSubmitted([dedupResult]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply duplicate-detection decision');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l">
      {dedupResult && (
        <DeduplicationWarning matches={dedupResult.dedup_check.matches} onSubmitAnyway={handleDedupDecision} onCancel={() => setDedupResult(null)} />
      )}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">{isMulti ? `Proposals (${submittedCount}/${forms.length})` : 'Proposal'}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="h-5 w-5" /></button>
      </div>
      {isMulti && <ProposalPanelTabs forms={forms} activeIndex={activeIndex} onSelect={setActiveIndex} onMove={moveForm} />}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <ProposalFormFields form={form} isAdmin={isAdmin} onUpdate={(updates) => updateForm(activeIndex, updates)} availableSections={availableSections} />
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      </div>
      {!allSubmitted && (
        <div className="border-t px-4 py-3">
          <button onClick={handleSubmitAll} disabled={isSubmitting || forms.some((f) => !f.submitted && (!f.title.trim() || !f.description.trim()))}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm">
            {isSubmitting ? (<><LoaderIcon className="h-4 w-4 animate-spin" />Submitting...</>) : (<><SendIcon className="h-4 w-4" />{isMulti ? `Submit All ${forms.length - submittedCount} Features` : 'Submit Proposal'}</>)}
          </button>
        </div>
      )}
    </div>
  );
}
