/**
 * Form fields for the proposal panel — title, description, journeys, admin fields
 * Supports both legacy flat criteria and new SpecKit journey structure
 */

import { useState } from 'react';
import { CheckCircleIcon } from './icons';
import { JourneyFields } from './JourneyFields';
import type { JourneyFormState } from './JourneyFields';
import type { ProposalJourney, ProposalTestCase } from './types';

export type { JourneyFormState };

export interface ProposalFormState {
  title: string;
  description: string;
  criteria: string;
  priority: string;
  category: string;
  specSection: string;
  submitted: boolean;
  submittedCode: string | null;
  /** SpecKit journey data — populated when AI provides structured journeys */
  journeys: JourneyFormState[];
  /** AI-generated test cases with type classification — passed through to backend */
  testCases: ProposalTestCase[];
}

export function initJourneyForm(j: ProposalJourney): JourneyFormState {
  return {
    title: j.title,
    priority: j.priority,
    description: j.description,
    why_priority: j.why_priority ?? '',
    independent_test: j.independent_test ?? '',
    acceptance_scenarios: (j.acceptance_scenarios ?? []).join('\n'),
  };
}

interface ProposalFormFieldsProps {
  form: ProposalFormState;
  isAdmin: boolean;
  onUpdate: (updates: Partial<ProposalFormState>) => void;
  availableSections?: string[];
}

export function ProposalFormFields({
  form,
  isAdmin,
  onUpdate,
  availableSections = [],
}: ProposalFormFieldsProps) {
  const [customSection, setCustomSection] = useState(false);
  const hasJourneys = form.journeys.length > 0;

  const updateJourney = (idx: number, updates: Partial<JourneyFormState>) => {
    const next = form.journeys.map((j, i) => (i === idx ? { ...j, ...updates } : j));
    onUpdate({ journeys: next });
  };

  return (
    <>
      {form.submitted && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircleIcon className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm text-emerald-800 font-medium">
            Submitted as {form.submittedCode}
          </span>
        </div>
      )}

      <Field label="Title">
        <input
          value={form.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          disabled={form.submitted}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={form.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          disabled={form.submitted}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
        />
      </Field>

      {/* SpecKit Journey Structure */}
      {hasJourneys ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">User Journeys</span>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
              SpecKit
            </span>
          </div>
          {form.journeys.map((j, idx) => (
            <JourneyFields
              key={idx}
              journey={j}
              index={idx}
              disabled={form.submitted}
              isAdmin={isAdmin}
              onUpdate={(updates) => updateJourney(idx, updates)}
            />
          ))}
        </div>
      ) : (
        <Field label="Acceptance Criteria" hint="One per line">
          <textarea
            value={form.criteria}
            onChange={(e) => onUpdate({ criteria: e.target.value })}
            disabled={form.submitted}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono disabled:bg-gray-50 disabled:text-gray-500"
          />
        </Field>
      )}

      {isAdmin && (
        <>
          <Field label="Priority">
            <select
              value={form.priority}
              onChange={(e) => onUpdate({ priority: e.target.value })}
              disabled={form.submitted}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="P1">P1 — Critical</option>
              <option value="P2">P2 — High</option>
              <option value="P3">P3 — Medium</option>
              <option value="P4">P4 — Low</option>
            </select>
          </Field>

          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              disabled={form.submitted}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">None</option>
              <option value="toolkit">Toolkit</option>
              <option value="business_module">Business Module</option>
              <option value="quality_code">Quality Code</option>
            </select>
          </Field>

          <Field label="Roadmap Section">
            {customSection ? (
              <div className="flex gap-2">
                <input
                  value={form.specSection}
                  onChange={(e) => onUpdate({ specSection: e.target.value })}
                  disabled={form.submitted}
                  placeholder="New section name..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => setCustomSection(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={availableSections.includes(form.specSection) ? form.specSection : ''}
                  onChange={(e) => onUpdate({ specSection: e.target.value })}
                  disabled={form.submitted}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {!availableSections.includes(form.specSection) && form.specSection && (
                    <option value="">{form.specSection} (new)</option>
                  )}
                  {availableSections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustomSection(true)}
                  disabled={form.submitted}
                  className="text-xs text-emerald-600 hover:text-emerald-700 whitespace-nowrap disabled:opacity-50"
                >
                  + New
                </button>
              </div>
            )}
          </Field>
        </>
      )}
    </>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="text-gray-400 font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
