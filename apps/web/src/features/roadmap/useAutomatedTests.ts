/**
 * Hook for automated test script operations (FR-109)
 */

import { useState, useCallback } from 'react';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type {
  GenerateScriptsResult,
  ExecuteScriptResult,
  ExecuteSuiteResult,
  ScriptListItem,
} from './automation-types';

interface UseAutomatedTestsState {
  scripts: ScriptListItem[];
  generating: boolean;
  executing: boolean;
  error: string | null;
  lastGeneration: GenerateScriptsResult | null;
  lastExecution: ExecuteScriptResult | null;
  lastSuiteResult: ExecuteSuiteResult | null;
}

export function useAutomatedTests(featureId: string) {
  const [state, setState] = useState<UseAutomatedTestsState>({
    scripts: [],
    generating: false,
    executing: false,
    error: null,
    lastGeneration: null,
    lastExecution: null,
    lastSuiteResult: null,
  });

  const loadScripts = useCallback(async () => {
    try {
      const scripts = await testAutomationApi.getScripts(featureId);
      setState((s) => ({ ...s, scripts, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load scripts';
      setState((s) => ({ ...s, error: msg }));
    }
  }, [featureId]);

  const generateScripts = useCallback(async (testCaseIds?: string[]) => {
    setState((s) => ({ ...s, generating: true, error: null }));
    try {
      const result = await testAutomationApi.generateScripts(featureId, testCaseIds);
      setState((s) => ({ ...s, generating: false, lastGeneration: result }));
      await loadScripts();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setState((s) => ({ ...s, generating: false, error: msg }));
      return null;
    }
  }, [featureId, loadScripts]);

  const executeScript = useCallback(async (
    scriptId: string,
    environment: string,
  ) => {
    setState((s) => ({ ...s, executing: true, error: null }));
    try {
      const result = await testAutomationApi.executeScript(scriptId, environment);
      setState((s) => ({ ...s, executing: false, lastExecution: result }));
      await loadScripts();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      setState((s) => ({ ...s, executing: false, error: msg }));
      return null;
    }
  }, [loadScripts]);

  const executeSuite = useCallback(async (environment: string) => {
    setState((s) => ({ ...s, executing: true, error: null }));
    try {
      const result = await testAutomationApi.executeSuite(featureId, environment);
      setState((s) => ({ ...s, executing: false, lastSuiteResult: result }));
      await loadScripts();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Suite execution failed';
      setState((s) => ({ ...s, executing: false, error: msg }));
      return null;
    }
  }, [featureId, loadScripts]);

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

  return {
    ...state,
    loadScripts,
    generateScripts,
    executeScript,
    executeSuite,
    deleteScript,
  };
}
