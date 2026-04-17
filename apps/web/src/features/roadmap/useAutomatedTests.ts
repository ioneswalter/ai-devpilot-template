/**
 * Hook for automated test script operations (FR-109)
 * Executes tests via the browser extension for real browser-based validation.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import { runPreflight } from './usePreflightValidation';
import { createGenerateScripts } from './useScriptGeneration';
import { useExecuteScript, executeApiTest } from './useScriptExecution';
import type { PreflightResult } from './usePreflightValidation';
import type { GenerateScriptsResult, ScriptListItem } from './automation-types';
import type { ScriptStep } from './automation-types';
import type { TestScriptExecutionResult } from './useExtensionBridge';

// Re-export types that consumers use
export type { BrowserScriptResult, BrowserSuiteResult } from './useScriptExecution';
import type { BrowserScriptResult, BrowserSuiteResult } from './useScriptExecution';

interface UseAutomatedTestsState {
  scripts: ScriptListItem[];
  scriptsLoaded: boolean;
  generating: boolean;
  generatingProgress: string | null;
  executing: boolean;
  executingProgress: { current: number; total: number; scriptTitle: string } | null;
  liveResults: BrowserScriptResult[];
  error: string | null;
  lastGeneration: GenerateScriptsResult | null;
  lastSuiteResult: BrowserSuiteResult | null;
  preflightResult: PreflightResult | null;
  preflightRunning: boolean;
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

  const scriptsRef = useRef<ScriptListItem[]>([]);
  const abortRef = useRef(false);
  const executeScriptFn = useExecuteScript();

  const loadScripts = useCallback(async () => {
    try {
      const { data: e2eData, error: e2eErr } = await supabase
        .from('automated_test_scripts')
        .select(`
          id, test_case_id, generation_source, is_stale, is_custom_modified,
          last_run_result, last_run_at, created_at, script_steps, generation_notes,
          test_cases!inner(title)
        `)
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false });

      if (e2eErr) throw new Error(e2eErr.message);

      const e2eScripts: ScriptListItem[] = (e2eData ?? []).map((s) => {
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
          generation_notes: (s as Record<string, unknown>).generation_notes as string | null ?? null,
          created_at: s.created_at,
        };
      });

      const { data: apiData } = await supabase
        .from('api_verification_tests')
        .select(`
          id, test_case_id, endpoint, method, is_stale,
          last_run_result, last_run_at, created_at, generation_notes,
          test_cases!inner(title)
        `)
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false });

      const apiScripts: ScriptListItem[] = (apiData ?? []).map((s) => {
        const tc = s.test_cases as unknown as { title: string };
        return {
          id: s.id,
          test_case_id: s.test_case_id,
          test_case_title: tc?.title || 'Unknown',
          step_count: 0,
          generation_source: 'ai_criteria' as const,
          tier: 'api' as const,
          is_stale: s.is_stale,
          is_custom_modified: false,
          last_run_result: s.last_run_result as ScriptListItem['last_run_result'],
          last_run_at: s.last_run_at,
          generation_notes: s.generation_notes ?? null,
          created_at: s.created_at,
        };
      });

      const scripts = [...apiScripts, ...e2eScripts];
      scriptsRef.current = scripts;
      setState((s) => ({ ...s, scripts, scriptsLoaded: true, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load scripts';
      setState((s) => ({ ...s, scriptsLoaded: true, error: msg }));
    }
  }, [featureId]);

  const generateScripts = useCallback(
    createGenerateScripts(featureId, setState as Parameters<typeof createGenerateScripts>[1], loadScripts),
    [featureId, loadScripts],
  );

  const executeScript = executeScriptFn;

  const executeSuite = useCallback(async (
    environment: string,
    extensionExecute: (steps: ScriptStep[], baseUrl?: string) => Promise<TestScriptExecutionResult | null>,
  ): Promise<BrowserSuiteResult | null> => {
    abortRef.current = false;
    setState((s) => ({ ...s, executing: true, executingProgress: null, liveResults: [], error: null, lastSuiteResult: null }));

    try {
      const currentScripts = scriptsRef.current;
      const activeScripts = currentScripts.filter((s) => !s.is_stale);
      const staleCount = currentScripts.length - activeScripts.length;

      if (activeScripts.length === 0) {
        const result: BrowserSuiteResult = {
          feature_id: featureId, total_scripts: currentScripts.length,
          passed: 0, failed: 0, errors: 0, skipped_stale: staleCount,
          duration_ms: 0, is_release_ready: false, results: [],
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
          executingProgress: { current: i + 1, total: activeScripts.length, scriptTitle: script.test_case_title },
        }));

        try {
          const scriptResult = script.tier === 'api'
            ? await executeApiTest(script, environment)
            : await executeScript(script, environment, extensionExecute);
          results.push(scriptResult);
          if (scriptResult.result === 'passed') passed++;
          else if (scriptResult.result === 'failed') failed++;
          else errors++;
          setState((s) => ({ ...s, liveResults: [...results] }));
        } catch (err) {
          errors++;
          results.push({
            script_id: script.id, test_case_id: script.test_case_id,
            test_case_title: script.test_case_title, result: 'error',
            duration_ms: 0, steps_completed: 0, steps_total: script.step_count,
            step_results: [],
            failures: [{ step_number: 0, expected: 'Execution', actual: err instanceof Error ? err.message : 'Unknown error' }],
          });
          setState((s) => ({ ...s, liveResults: [...results] }));
        }
      }

      const suiteResult: BrowserSuiteResult = {
        feature_id: featureId, total_scripts: currentScripts.length,
        passed, failed, errors, skipped_stale: staleCount,
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

  const runPreflightCheck = useCallback(async (featureCode: string): Promise<PreflightResult> => {
    setState((s) => ({ ...s, preflightRunning: true, preflightResult: null }));
    const scripts = scriptsRef.current.filter((s) => !s.is_stale).map((s) => ({
      id: s.id,
      testCaseTitle: s.test_case_title,
      steps: s.script_steps ?? [],
    }));
    const result = await runPreflight(featureCode, scripts);
    setState((s) => ({ ...s, preflightRunning: false, preflightResult: result }));
    return result;
  }, []);

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
