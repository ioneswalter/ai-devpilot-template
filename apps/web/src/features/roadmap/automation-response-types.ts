/**
 * API response types, gate warning types, and v1 compat types for test automation (FR-109 v2)
 */

import type { ScriptRunResult } from './automation-script-types';

// --- API Response Types (v2: two-tier) ---

export interface GenerateScriptsResult {
  categorized: { api: number; e2e: number; manual: number };
  api_tests: Array<{
    test_case_id: string;
    test_id: string;
    endpoint: string;
    assertion_count: number;
    negative_case_count: number;
  }>;
  e2e_scripts: Array<{
    test_case_id: string;
    script_id: string;
    step_count: number;
    selectors_used: { testid: number; role: number; label: number; text: number };
  }>;
  skipped: Array<{ test_case_id: string; reason: string }>;
}

export interface ApiTestResult {
  test_id: string;
  test_case_id: string;
  result: ScriptRunResult;
  duration_ms: number;
  setup_success: boolean;
  api_call: {
    endpoint: string;
    method: string;
    status: number;
    response_body: unknown;
    duration_ms: number;
  };
  assertions: Array<{
    description: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
  }>;
  negative_cases: Array<{
    description: string;
    expected_status: number;
    actual_status: number;
    passed: boolean;
  }>;
  cleanup_success: boolean;
}

export interface ExecuteScriptResult {
  script_id: string;
  result: ScriptRunResult;
  steps_completed: number;
  steps_total: number;
  duration_ms: number;
  retries_used: number;
  failures: Array<{
    step_number: number;
    expected: string;
    actual: string;
    screenshot_base64?: string;
    retry_attempts: number;
  }>;
}

export interface TierResults {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  duration_ms: number;
}

export interface ExecuteSuiteResult {
  feature_id: string;
  strategy: 'fail_fast';
  api_results: TierResults & { results: ApiTestResult[] };
  e2e_results: TierResults & {
    skipped_stale: number;
    skipped_api_failed: boolean;
    results: ExecuteScriptResult[];
  };
  total_duration_ms: number;
  is_release_ready: boolean;
  guidance_generated: boolean;
  recommendations_generated: boolean;
}

export interface StalenessResult {
  total_scripts: number;
  stale_count: number;
  stale_scripts: Array<{
    script_id: string;
    test_case_id: string;
    test_case_title: string;
    criterion_changed: string;
  }>;
}

// --- Guidance & Recommendation Response Types ---

import type {
  FailureGuidance,
  GuidanceGroup,
  ImprovementRecommendation,
} from './automation-test-types';

export interface GuidanceListResult {
  guidance: Array<FailureGuidance & { test_case_title: string }>;
  groups: GuidanceGroup[];
}

export interface RecommendationListResult {
  recommendations: ImprovementRecommendation[];
}

// --- Gate Warning Types (FR-145) ---

export type GateType = 'schema' | 'selector' | 'infrastructure' | 'state' | 'smoke';
export type GateLevel = 'PASS' | 'WARN' | 'FAIL' | 'FIX';

export interface GateWarning {
  level: GateLevel;
  type: GateType;
  message: string;
}

export interface GateWarningDismissal {
  dismissed: boolean;
  dismissedAt: string;
}

export type GateWarningState = Record<string, GateWarningDismissal>;

// --- v1 Compat Types (kept for existing components, will be removed) ---

export interface VisualAssertResult {
  passed: boolean;
  explanation: string;
  visual_elements_found: string[];
  visual_elements_missing: string[];
  cosmetic_only: boolean;
  confidence: number;
  checkpoint_id: string;
}

export interface ConvertManualResult {
  script_id: string;
  test_case_id: string;
  step_count: number;
  source_session_id: string;
  criterion_refs: number[];
  validation_note: string;
}
