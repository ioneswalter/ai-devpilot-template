/**
 * useCriteriaCoverage - Computes acceptance criteria coverage from test results.
 * Maps each criterion to test cases and their evidence status.
 */

import { useMemo } from 'react';
import type {
  CriterionCoverage,
  CoverageSummary,
  CriterionStatus,
} from './guided-testing-types';

interface TestCaseInput {
  id: string;
  test_code: string;
  title: string;
  passed: boolean | null;
}

interface TestRunInput {
  test_case_id: string;
  evidence: Record<string, unknown> | null;
  result: string;
  executed_at: string;
}

interface CriteriaCoverageInput {
  criteria: string[];
  testCases: TestCaseInput[];
  testRuns: TestRunInput[];
}

function isGuidedEvidence(ev: Record<string, unknown> | null): boolean {
  return ev !== null && ev.type === 'guided' && Array.isArray(ev.steps);
}

export function useCriteriaCoverage({ criteria, testCases, testRuns }: CriteriaCoverageInput): CoverageSummary {
  return useMemo(() => {
    const coverageMap = new Map<number, CriterionCoverage>();

    // Initialize all criteria as untested
    criteria.forEach((text, index) => {
      coverageMap.set(index, {
        index,
        text,
        status: 'untested' as CriterionStatus,
      });
    });

    // Build a lookup for latest test run per test case
    const latestRuns = new Map<string, TestRunInput>();
    for (const run of testRuns) {
      const existing = latestRuns.get(run.test_case_id);
      if (!existing || run.executed_at > existing.executed_at) {
        latestRuns.set(run.test_case_id, run);
      }
    }

    // Map guided evidence to criteria
    for (const run of latestRuns.values()) {
      if (!isGuidedEvidence(run.evidence)) continue;

      const tc = testCases.find((t) => t.id === run.test_case_id);
      const ev = run.evidence as { steps?: Array<{ criterion_text: string; verdict: string }> };
      for (const step of ev.steps ?? []) {
        // Match by criterion text (fuzzy — find the closest criterion)
        const matchIdx = findCriterionIndex(criteria, step.criterion_text);
        if (matchIdx < 0) continue;

        const current = coverageMap.get(matchIdx);
        if (!current) continue;

        const newStatus: CriterionStatus =
          step.verdict === 'passed' ? 'passed' : step.verdict === 'failed' ? 'failed' : current.status;

        // Failed overrides passed (conservative)
        if (current.status === 'failed') continue;
        if (newStatus === 'untested') continue;

        coverageMap.set(matchIdx, {
          ...current,
          status: newStatus,
          test_case_code: tc?.test_code,
          test_case_id: tc?.id,
          evidence_date: run.executed_at,
        });
      }
    }

    // Also map non-guided test results by test case pass/fail
    for (const tc of testCases) {
      if (tc.passed === null) continue;
      // For non-guided tests, try to map by test title containing criterion text
      for (const [idx, cov] of coverageMap.entries()) {
        if (cov.status !== 'untested') continue;
        if (tc.title.toLowerCase().includes(cov.text.toLowerCase().slice(0, 30))) {
          coverageMap.set(idx, {
            ...cov,
            status: tc.passed ? 'passed' : 'failed',
            test_case_code: tc.test_code,
            test_case_id: tc.id,
          });
        }
      }
    }

    const coverageList = Array.from(coverageMap.values());
    const passed = coverageList.filter((c) => c.status === 'passed').length;
    const failed = coverageList.filter((c) => c.status === 'failed').length;
    const untested = coverageList.filter((c) => c.status === 'untested').length;
    const total = coverageList.length;

    return {
      total,
      passed,
      failed,
      untested,
      percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
      criteria: coverageList,
    };
  }, [criteria, testCases, testRuns]);
}

function findCriterionIndex(criteria: string[], text: string): number {
  // Exact match first
  const exactIdx = criteria.findIndex((c) => c === text);
  if (exactIdx >= 0) return exactIdx;

  // Partial match — find best overlap
  const normalized = text.toLowerCase().trim();
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < criteria.length; i++) {
    const criterionNorm = criteria[i].toLowerCase().trim();
    if (criterionNorm.includes(normalized) || normalized.includes(criterionNorm)) {
      const score = Math.min(criterionNorm.length, normalized.length);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}
