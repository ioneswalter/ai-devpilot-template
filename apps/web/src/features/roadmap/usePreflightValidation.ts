/**
 * Preflight validation for automated tests (FR-123+)
 * Runs BEFORE test execution to catch data and script issues early.
 * Admins should never see a test fail due to bad test data or scripts.
 */

import { supabase } from '@/lib/supabase-client';
import type { ScriptStep } from './automation-types';

// ── Types ─────────────────────────────────────────────────────────

export interface PreflightIssue {
  code: PreflightCode;
  severity: 'error' | 'warning';
  scriptTitle?: string;
  stepNumber?: number;
  message: string;
  suggestion: string;
}

export interface PreflightResult {
  passed: boolean;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
  checkedAt: string;
}

type PreflightCode =
  | 'NO_USER_DATA'
  | 'MISSING_WAIT_AFTER_NAV'
  | 'SHORT_TIMEOUT'
  | 'EMPTY_TARGET'
  | 'NULL_CONFIG'
  | 'NO_SCRIPTS';

interface ScriptForValidation {
  id: string;
  testCaseTitle: string;
  steps: ScriptStep[];
}

// ── Feature-specific data checks ──────────────────────────────────

interface DataCheck {
  table: string;
  label: string;
  filter: (userId: string) => Record<string, string>;
  suggestion: string;
}

/**
 * Registry of data checks per feature code.
 * Each check verifies the admin user has the required data to run tests.
 */
const DATA_CHECKS: Record<string, DataCheck[]> = {
  'FR-123': [
    {
      table: 'course_enrollments',
      label: 'course enrollment',
      filter: (uid) => ({ user_id: uid }),
      suggestion: 'Regenerate test data — the current user has no enrollment.',
    },
    {
      table: 'module_progress',
      label: 'module progress',
      filter: (uid) => ({ user_id_via_enrollment: uid }),
      suggestion: 'Regenerate test data — no module progress for current user.',
    },
  ],
};

const CONFIG_CHECKS: Record<string, Array<{
  table: string;
  column: string;
  label: string;
  suggestion: string;
}>> = {
  'FR-123': [
    {
      table: 'module_assessments',
      column: 'max_retries',
      label: 'assessment max_retries',
      suggestion: 'Regenerate test data — max_retries must be set for retry tests.',
    },
  ],
};

// ── Core validation ───────────────────────────────────────────────

export async function runPreflight(
  featureCode: string,
  scripts: ScriptForValidation[],
): Promise<PreflightResult> {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  if (scripts.length === 0) {
    errors.push({
      code: 'NO_SCRIPTS',
      severity: 'error',
      message: 'No test scripts found.',
      suggestion: `Run \\generate-tests ${featureCode} in Claude Code first.`,
    });
    return { passed: false, errors, warnings, checkedAt: new Date().toISOString() };
  }

  // 1. Script structure checks (synchronous)
  for (const script of scripts) {
    validateScriptStructure(script, errors, warnings);
  }

  // 2. Data ownership checks (async — needs DB)
  await validateTestData(featureCode, errors);

  // 3. Config completeness checks (async)
  await validateConfig(featureCode, errors);

  const passed = errors.length === 0;
  return { passed, errors, warnings, checkedAt: new Date().toISOString() };
}

// ── Script structure validation ───────────────────────────────────

function validateScriptStructure(
  script: ScriptForValidation,
  errors: PreflightIssue[],
  warnings: PreflightIssue[],
) {
  const { steps, testCaseTitle } = script;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const next = steps[i + 1];

    // Check: empty target on interactive steps
    if (['click', 'type', 'assert_text', 'assert_visible'].includes(step.action)) {
      if (!step.target?.value?.trim()) {
        errors.push({
          code: 'EMPTY_TARGET',
          severity: 'error',
          scriptTitle: testCaseTitle,
          stepNumber: step.step_number,
          message: `Step ${step.step_number}: ${step.action} has empty target.`,
          suggestion: 'Fix the script — this step has no selector value.',
        });
      }
    }

    // v2: Warn if text-first selector used on interactive steps (testid preferred)
    if (['click', 'type', 'select'].includes(step.action) && step.target?.strategy === 'text') {
      warnings.push({
        code: 'TEXT_FIRST_SELECTOR',
        severity: 'warning',
        scriptTitle: testCaseTitle,
        stepNumber: step.step_number,
        message: `Step ${step.step_number}: uses text selector "${step.target.value}" — prefer data-testid.`,
        suggestion: 'Add a data-testid attribute to the element and use testid strategy.',
      });
    }

    // Check: navigate must be followed by a wait/wait_for
    if (step.action === 'navigate' && next) {
      if (next.action !== 'wait' && next.action !== 'wait_for') {
        warnings.push({
          code: 'MISSING_WAIT_AFTER_NAV',
          severity: 'warning',
          scriptTitle: testCaseTitle,
          stepNumber: step.step_number,
          message: `Step ${step.step_number}: navigate not followed by a wait/wait_for step.`,
          suggestion: 'Add a wait_for step with condition="visible" after navigation.',
        });
      } else if (next.action === 'wait' && (next.timeout_ms ?? 0) < 2000) {
        warnings.push({
          code: 'SHORT_TIMEOUT',
          severity: 'warning',
          scriptTitle: testCaseTitle,
          stepNumber: next.step_number,
          message: `Step ${next.step_number}: wait after navigate is only ${next.timeout_ms}ms.`,
          suggestion: 'Increase to 3000ms+ to handle edge function cold starts.',
        });
      }
    }

    // Check: click that causes navigation should also have adequate wait after
    if (step.action === 'click' && next && next.action !== 'wait') {
      // Only warn if it looks like a navigation click (Resume, Enroll, Back, etc.)
      const navKeywords = ['resume', 'enroll', 'back', 'next', 'open', 'view', 'start'];
      const isNavClick = navKeywords.some((kw) =>
        (step.target?.value ?? '').toLowerCase().includes(kw),
      );
      if (isNavClick) {
        warnings.push({
          code: 'MISSING_WAIT_AFTER_NAV',
          severity: 'warning',
          scriptTitle: testCaseTitle,
          stepNumber: step.step_number,
          message: `Step ${step.step_number}: click "${step.target.value}" likely navigates but has no wait after.`,
          suggestion: 'Add a wait step (3000ms+) after clicks that trigger page loads.',
        });
      }
    }

    // Check: assertion timeouts too short
    if (['assert_text', 'assert_visible'].includes(step.action)) {
      if ((step.timeout_ms ?? 0) < 3000) {
        warnings.push({
          code: 'SHORT_TIMEOUT',
          severity: 'warning',
          scriptTitle: testCaseTitle,
          stepNumber: step.step_number,
          message: `Step ${step.step_number}: ${step.action} timeout is only ${step.timeout_ms}ms.`,
          suggestion: 'Increase to 5000ms+ for assertions that depend on API responses.',
        });
      }
    }
  }
}

// ── Data ownership validation ─────────────────────────────────────

async function validateTestData(
  featureCode: string,
  errors: PreflightIssue[],
) {
  const checks = DATA_CHECKS[featureCode];
  if (!checks) return; // No data checks defined for this feature

  // Get current user
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) {
    errors.push({
      code: 'NO_USER_DATA',
      severity: 'error',
      message: 'Not logged in — cannot verify test data ownership.',
      suggestion: 'Log in before running tests.',
    });
    return;
  }

  for (const check of checks) {
    // Special case: module_progress needs a join through enrollments
    if (check.filter(userId).user_id_via_enrollment) {
      const { count } = await supabase
        .from('course_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!count || count === 0) {
        errors.push({
          code: 'NO_USER_DATA',
          severity: 'error',
          message: `No ${check.label} found for the current user.`,
          suggestion: check.suggestion,
        });
      }
      continue;
    }

    const filter = check.filter(userId);
    let query = supabase.from(check.table).select('id', { count: 'exact', head: true });
    for (const [col, val] of Object.entries(filter)) {
      query = query.eq(col, val);
    }

    const { count } = await query;
    if (!count || count === 0) {
      errors.push({
        code: 'NO_USER_DATA',
        severity: 'error',
        message: `No ${check.label} found for the current user.`,
        suggestion: check.suggestion,
      });
    }
  }
}

// ── Config completeness validation ────────────────────────────────

async function validateConfig(
  featureCode: string,
  errors: PreflightIssue[],
) {
  const checks = CONFIG_CHECKS[featureCode];
  if (!checks) return;

  for (const check of checks) {
    const { data } = await supabase
      .from(check.table)
      .select(check.column)
      .not(check.column, 'is', null)
      .limit(1);

    if (!data || data.length === 0) {
      errors.push({
        code: 'NULL_CONFIG',
        severity: 'error',
        message: `${check.label} is not configured — feature flow untestable.`,
        suggestion: check.suggestion,
      });
    }
  }
}
