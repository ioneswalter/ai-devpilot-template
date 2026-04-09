/**
 * Hook for automated test script operations (FR-109)
 * Executes tests via the browser extension for real browser-based validation.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import { runPreflight } from './usePreflightValidation';
import type { PreflightResult } from './usePreflightValidation';
import type {
  GenerateScriptsResult,
  ScriptListItem,
} from './automation-types';
import type { TestStepResult } from './useExtensionBridge';

interface UseAutomatedTestsState {
  scripts: ScriptListItem[];
  scriptsLoaded: boolean;
  generating: boolean;
  generatingProgress: string | null;
  executing: boolean;
  executingProgress: { current: number; total: number; scriptTitle: string } | null;
  /** Live results accumulated during suite execution */
  liveResults: BrowserScriptResult[];
  error: string | null;
  lastGeneration: GenerateScriptsResult | null;
  lastSuiteResult: BrowserSuiteResult | null;
  /** Preflight validation result — null until preflight runs */
  preflightResult: PreflightResult | null;
  preflightRunning: boolean;
}

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

export function useAutomatedTests(featureId: string) {
  const [state, setState] = useState<UseAutomatedTestsState>({
    scripts: [],
    scriptsLoaded: false,
    generating: false,
    generatingProgress: null,
    executing: false,
    executingProgress: null,
    liveResults: [],
    error: null,
    lastGeneration: null,
    lastSuiteResult: null,
    preflightResult: null,
    preflightRunning: false,
  });

  // Use ref to avoid stale closures in executeSuite
  const scriptsRef = useRef<ScriptListItem[]>([]);
  const abortRef = useRef(false);

  const loadScripts = useCallback(async () => {
    try {
      // Fetch scripts directly from Supabase to ensure script_steps are included
      // (Edge Function may not be deployed with latest code)
      const { data, error } = await supabase
        .from('automated_test_scripts')
        .select(`
          id, test_case_id, generation_source, is_stale, is_custom_modified,
          last_run_result, last_run_at, created_at, script_steps,
          test_cases!inner(title)
        `)
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      const scripts: ScriptListItem[] = (data ?? []).map((s) => {
        const steps = s.script_steps as unknown[];
        const tc = s.test_cases as unknown as { title: string };
        return {
          id: s.id,
          test_case_id: s.test_case_id,
          test_case_title: tc?.title || 'Unknown',
          step_count: Array.isArray(steps) ? steps.length : 0,
          script_steps: Array.isArray(steps) ? steps as ScriptListItem['script_steps'] : [],
          generation_source: s.generation_source as ScriptListItem['generation_source'],
          tier: 'e2e' as const,
          is_stale: s.is_stale,
          is_custom_modified: s.is_custom_modified,
          last_run_result: s.last_run_result as ScriptListItem['last_run_result'],
          last_run_at: s.last_run_at,
          created_at: s.created_at,
        };
      });

      scriptsRef.current = scripts;
      setState((s) => ({ ...s, scripts, scriptsLoaded: true, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load scripts';
      setState((s) => ({ ...s, scriptsLoaded: true, error: msg }));
    }
  }, [featureId]);

  /** Generate scripts one test case at a time to avoid Edge Function compute limits */
  const generateScripts = useCallback(async (testCaseIds?: string[], force = false) => {
    setState((s) => ({ ...s, generating: true, generatingProgress: null, error: null }));
    try {
      let ids = testCaseIds;
      if (!ids?.length) {
        const { data: cases } = await supabase
          .from('test_cases')
          .select('id')
          .eq('feature_id', featureId);
        ids = cases?.map((c) => c.id) ?? [];
      }

      if (ids.length === 0) {
        setState((s) => ({ ...s, generating: false, generatingProgress: null, error: 'No test cases found' }));
        return null;
      }

      const allApiTests: GenerateScriptsResult['api_tests'] = [];
      const allE2eScripts: GenerateScriptsResult['e2e_scripts'] = [];
      const allSkipped: GenerateScriptsResult['skipped'] = [];
      let catApi = 0, catE2e = 0, catManual = 0;

      for (let i = 0; i < ids.length; i++) {
        setState((s) => ({ ...s, generatingProgress: `${i + 1} of ${ids.length}` }));
        try {
          const result = await testAutomationApi.generateScripts(featureId, [ids[i]], force);
          allApiTests.push(...result.api_tests);
          allE2eScripts.push(...result.e2e_scripts);
          allSkipped.push(...result.skipped);
          catApi += result.categorized.api;
          catE2e += result.categorized.e2e;
          catManual += result.categorized.manual;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Generation failed';
          allSkipped.push({ test_case_id: ids[i], reason: msg });
        }
      }

      const merged: GenerateScriptsResult = {
        categorized: { api: catApi, e2e: catE2e, manual: catManual },
        api_tests: allApiTests,
        e2e_scripts: allE2eScripts,
        skipped: allSkipped,
      };

      setState((s) => ({ ...s, generating: false, generatingProgress: null, lastGeneration: merged }));
      await loadScripts();
      return merged;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setState((s) => ({ ...s, generating: false, generatingProgress: null, error: msg }));
      return null;
    }
  }, [featureId, loadScripts]);

  /**
   * Execute a single script via the browser extension.
   * Opens a real browser tab and performs actual clicks/assertions.
   */
  const executeScript = useCallback(async (
    script: ScriptListItem,
    _environment: string,
    extensionExecute: (steps: import('./automation-types').ScriptStep[], baseUrl?: string) => Promise<import('./useExtensionBridge').TestScriptExecutionResult | null>,
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

  /**
   * Execute all scripts via the browser extension, one at a time.
   */
  const executeSuite = useCallback(async (
    environment: string,
    extensionExecute: (steps: import('./automation-types').ScriptStep[], baseUrl?: string) => Promise<import('./useExtensionBridge').TestScriptExecutionResult | null>,
  ): Promise<BrowserSuiteResult | null> => {
    abortRef.current = false;
    setState((s) => ({ ...s, executing: true, executingProgress: null, liveResults: [], error: null, lastSuiteResult: null }));

    try {
      const currentScripts = scriptsRef.current;
      const activeScripts = currentScripts.filter((s) => !s.is_stale);
      const staleCount = currentScripts.length - activeScripts.length;

      if (activeScripts.length === 0) {
        const result: BrowserSuiteResult = {
          feature_id: featureId,
          total_scripts: currentScripts.length,
          passed: 0, failed: 0, errors: 0,
          skipped_stale: staleCount,
          duration_ms: 0,
          is_release_ready: false,
          results: [],
        };
        setState((s) => ({ ...s, executing: false, executingProgress: null, lastSuiteResult: result }));
        return result;
      }

      const startTime = Date.now();
      const results: BrowserScriptResult[] = [];
      let passed = 0, failed = 0, errors = 0;

      for (let i = 0; i < activeScripts.length; i++) {
        if (abortRef.current) break;
        const script = activeScripts[i];
        setState((s) => ({
          ...s,
          executingProgress: {
            current: i + 1,
            total: activeScripts.length,
            scriptTitle: script.test_case_title,
          },
        }));

        try {
          const scriptResult = await executeScript(script, environment, extensionExecute);
          results.push(scriptResult);
          if (scriptResult.result === 'passed') passed++;
          else if (scriptResult.result === 'failed') failed++;
          else errors++;
          setState((s) => ({ ...s, liveResults: [...results] }));
        } catch (err) {
          errors++;
          const errResult: BrowserScriptResult = {
            script_id: script.id,
            test_case_id: script.test_case_id,
            test_case_title: script.test_case_title,
            result: 'error',
            duration_ms: 0,
            steps_completed: 0,
            steps_total: script.step_count,
            step_results: [],
            failures: [{ step_number: 0, expected: 'Execution', actual: err instanceof Error ? err.message : 'Unknown error' }],
          };
          results.push(errResult);
          setState((s) => ({ ...s, liveResults: [...results] }));
        }
      }

      const suiteResult: BrowserSuiteResult = {
        feature_id: featureId,
        total_scripts: currentScripts.length,
        passed,
        failed,
        errors,
        skipped_stale: staleCount,
        duration_ms: Date.now() - startTime,
        is_release_ready: failed === 0 && errors === 0 && passed > 0,
        results,
      };

      setState((s) => ({ ...s, executing: false, executingProgress: null, lastSuiteResult: suiteResult }));
      await loadScripts();
      return suiteResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Suite execution failed';
      setState((s) => ({ ...s, executing: false, executingProgress: null, error: msg }));
      return null;
    }
  }, [featureId, executeScript, loadScripts]);

  const deleteScript = useCallback(async (scriptId: string, force = false) => {
    try {
      await testAutomationApi.deleteScript(scriptId, force);
      await loadScripts();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setState((s) => ({ ...s, error: msg }));
      return false;
    }
  }, [loadScripts]);

  const stopExecution = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, executing: false, executingProgress: null }));
  }, []);

  /** Run preflight validation before test execution */
  const runPreflightCheck = useCallback(async (featureCode: string): Promise<PreflightResult> => {
    setState((s) => ({ ...s, preflightRunning: true, preflightResult: null }));
    const scripts = scriptsRef.current.filter((s) => !s.is_stale).map((s) => ({
      id: s.id,
      testCaseTitle: s.test_case_title,
      steps: s.script_steps,
    }));
    const result = await runPreflight(featureCode, scripts);
    setState((s) => ({ ...s, preflightRunning: false, preflightResult: result }));
    return result;
  }, []);

  /** Clear preflight result (e.g., after fixing issues) */
  const clearPreflight = useCallback(() => {
    setState((s) => ({ ...s, preflightResult: null }));
  }, []);

  return {
    ...state,
    loadScripts,
    generateScripts,
    executeScript,
    executeSuite,
    stopExecution,
    deleteScript,
    runPreflightCheck,
    clearPreflight,
  };
}
