/**
 * Hook for generating automated test scripts (FR-109).
 * Generates scripts one test case at a time to avoid Edge Function compute limits.
 */

import { supabase } from '@/lib/supabase-client';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { GenerateScriptsResult } from './automation-types';
import type { UseAutomatedTestsState } from './useAutomatedTests';

type SetState = (updater: (s: UseAutomatedTestsState) => UseAutomatedTestsState) => void;

export function createGenerateScripts(
  featureId: string,
  setState: SetState,
  loadScripts: () => Promise<void>
) {
  return async (testCaseIds?: string[], force = false) => {
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
        setState((s) => ({
          ...s,
          generating: false,
          generatingProgress: null,
          error: 'No test cases found',
        }));
        return null;
      }

      const allApiTests: GenerateScriptsResult['api_tests'] = [];
      const allE2eScripts: GenerateScriptsResult['e2e_scripts'] = [];
      const allSkipped: GenerateScriptsResult['skipped'] = [];
      let catApi = 0,
        catE2e = 0,
        catManual = 0;

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

      setState((s) => ({
        ...s,
        generating: false,
        generatingProgress: null,
        lastGeneration: merged,
      }));
      await loadScripts();
      return merged;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setState((s) => ({ ...s, generating: false, generatingProgress: null, error: msg }));
      return null;
    }
  };
}
