/**
 * Single script and suite execution logic for automated tests (FR-109).
 * Executes tests via the browser extension for real browser-based validation.
 */

import { useCallback } from 'react';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { ScriptStep } from './automation-types';
import type { ScriptListItem } from './automation-types';
import type { TestStepResult, TestScriptExecutionResult } from './useExtensionBridge';

/** Result from a single script executed in the browser */
export interface BrowserScriptResult {
  script_id: string;
  test_case_id: string;
  test_case_title: string;
  result: 'passed' | 'failed' | 'error' | 'skipped';
  duration_ms: number;
  steps_completed: number;
  steps_total: number;
  step_results: TestStepResult[];
  failures: Array<{ step_number: number; expected: string; actual: string }>;
}

/** Result from executing the full suite via the browser */
export interface BrowserSuiteResult {
  feature_id: string;
  total_scripts: number;
  passed: number;
  failed: number;
  errors: number;
  skipped_stale: number;
  duration_ms: number;
  is_release_ready: boolean;
  results: BrowserScriptResult[];
}

type ExtensionExecuteFn = (steps: ScriptStep[], baseUrl?: string) => Promise<TestScriptExecutionResult | null>;

/**
 * Execute a single script via the browser extension.
 * Opens a real browser tab and performs actual clicks/assertions.
 */
export function useExecuteScript() {
  return useCallback(async (
    script: ScriptListItem,
    _environment: string,
    extensionExecute: ExtensionExecuteFn,
  ): Promise<BrowserScriptResult> => {
    if (script.is_stale) {
      return {
        script_id: script.id,
        test_case_id: script.test_case_id,
        test_case_title: script.test_case_title,
        result: 'skipped',
        duration_ms: 0,
        steps_completed: 0,
        steps_total: script.step_count,
        step_results: [],
        failures: [],
      };
    }

    const steps = script.script_steps;
    console.log('[SpecKit Auto] executeScript:', script.test_case_title, 'steps:', steps?.length ?? 'NULL', 'stale:', script.is_stale);
    if (!steps?.length) {
      console.warn('[SpecKit Auto] No steps for script', script.id, '- script_steps is', steps);
      return {
        script_id: script.id,
        test_case_id: script.test_case_id,
        test_case_title: script.test_case_title,
        result: 'error',
        duration_ms: 0,
        steps_completed: 0,
        steps_total: script.step_count,
        step_results: [],
        failures: [{ step_number: 0, expected: 'Script steps', actual: 'No steps available' }],
      };
    }

    // Execute via browser extension
    const execResult = await extensionExecute(steps);
    if (!execResult) {
      return {
        script_id: script.id,
        test_case_id: script.test_case_id,
        test_case_title: script.test_case_title,
        result: 'error',
        duration_ms: 0,
        steps_completed: 0,
        steps_total: steps.length,
        step_results: [],
        failures: [{ step_number: 0, expected: 'Extension response', actual: 'Extension unavailable or timed out' }],
      };
    }

    const failures = execResult.results
      .filter((r) => !r.passed)
      .map((r) => ({
        step_number: r.step_number,
        expected: steps.find((s) => s.step_number === r.step_number)?.expected_outcome || 'Step passes',
        actual: r.actual_outcome,
      }));

    const result: 'passed' | 'failed' = failures.length > 0 ? 'failed' : 'passed';
    const stepsCompleted = execResult.results.filter((r) => r.passed).length;

    // Record result in the backend with the real browser result
    try {
      await testAutomationApi.executeScript(script.id, _environment, {
        result,
        duration_ms: execResult.duration_ms,
        steps_completed: stepsCompleted,
        steps_total: steps.length,
        failures,
      });
    } catch {
      // Backend recording is best-effort; the real result is from the browser
    }

    return {
      script_id: script.id,
      test_case_id: script.test_case_id,
      test_case_title: script.test_case_title,
      result,
      duration_ms: execResult.duration_ms,
      steps_completed: stepsCompleted,
      steps_total: steps.length,
      step_results: execResult.results,
      failures,
    };
  }, []);
}

/**
 * Execute a single API test server-side.
 */
export async function executeApiTest(
  script: ScriptListItem,
  environment: string,
): Promise<BrowserScriptResult> {
  try {
    const apiRes = await testAutomationApi.executeApiTest(script.id, environment);
    return {
      script_id: script.id,
      test_case_id: script.test_case_id,
      test_case_title: script.test_case_title,
      result: apiRes.result,
      duration_ms: apiRes.duration_ms,
      steps_completed: apiRes.result === 'passed' ? 1 : 0,
      steps_total: 1,
      step_results: [],
      failures: apiRes.result !== 'passed'
        ? [{ step_number: 0, expected: 'API assertions pass', actual: (apiRes.assertions?.find((a: { passed: boolean }) => !a.passed) as { description?: string })?.description || 'Failed' }]
        : [],
    };
  } catch (err) {
    return {
      script_id: script.id,
      test_case_id: script.test_case_id,
      test_case_title: script.test_case_title,
      result: 'error',
      duration_ms: 0,
      steps_completed: 0,
      steps_total: 1,
      step_results: [],
      failures: [{ step_number: 0, expected: 'API test executes', actual: err instanceof Error ? err.message : 'Unknown error' }],
    };
  }
}
