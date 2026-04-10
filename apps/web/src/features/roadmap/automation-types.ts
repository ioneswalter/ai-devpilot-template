/**
 * Shared types for AI-Powered Test Automation (FR-109 v2)
 * Two-tier: API verification tests + hardened browser extension E2E tests
 */

// --- Script Step Types (v2: adds wait_for, api_setup, api_cleanup, api_assert) ---

export type ScriptAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'wait'
  | 'wait_for'
  | 'assert_text'
  | 'assert_visible'
  | 'assert_not_visible'
  | 'screenshot'
  | 'select'
  | 'hover'
  | 'api_setup'
  | 'api_cleanup'
  | 'api_assert';

export type TargetStrategy = 'text' | 'role' | 'label' | 'testid' | 'url' | 'placeholder';

export type WaitCondition = 'visible' | 'gone' | 'text_present';

export interface ScriptTarget {
  strategy: TargetStrategy;
  value: string;
}

export interface ScriptStep {
  step_number: number;
  action: ScriptAction;
  target: ScriptTarget;
  value?: string;
  expected_outcome?: string;
  checkpoint: boolean;
  criterion_index?: number;
  timeout_ms?: number;
  condition?: WaitCondition;
  retry?: boolean;
  /** HTTP method for api_setup/api_cleanup steps (default: POST) */
  method?: string;
  /** Auth token for api_setup/api_cleanup steps */
  auth_token?: string;
  /** Extra headers for api_setup/api_cleanup steps */
  extra_headers?: Record<string, string>;
}

// --- Automated Test Script ---

export type GenerationSource = 'ai_criteria' | 'manual_conversion' | 'manual_edit';
export type ScriptRunResult = 'passed' | 'failed' | 'error';
export type AutomationStatus = 'manual' | 'automated' | 'stale' | 'converting';
export type TestTier = 'api' | 'e2e' | 'both' | 'manual' | 'unassigned';

export interface RetryConfig {
  max_retries: number;
  delay_ms: number[];
}

export interface AutomatedTestScript {
  id: string;
  test_case_id: string;
  feature_id: string;
  script_steps: ScriptStep[];
  generation_source: GenerationSource;
  generated_from_hash: string;
  ai_model: string;
  is_stale: boolean;
  is_custom_modified: boolean;
  last_run_result: ScriptRunResult | null;
  last_run_at: string | null;
  failure_count: number;
  generation_notes: string | null;
  tier: 'e2e';
  retry_config: RetryConfig;
  data_setup_steps: ScriptStep[];
  data_cleanup_steps: ScriptStep[];
  created_at: string;
  updated_at: string;
  created_by: string;
}

// --- API Verification Test (v2 new tier) ---

export interface ApiTestAssertions {
  status: number;
  response_match: Record<string, unknown>;
  db_assertions?: Array<{
    query: string;
    expected: unknown;
    description: string;
  }>;
}

export interface ApiTestNegativeCase {
  description: string;
  auth_context: { type: 'admin' | 'anon' | 'user'; user_id?: string };
  request_body: Record<string, unknown>;
  expected_status: number;
  expected_error_code: string;
}

export interface ApiVerificationTest {
  id: string;
  test_case_id: string;
  feature_id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  setup_sql: string[];
  request_body: Record<string, unknown>;
  auth_context: { type: string; user_id?: string };
  assertions: ApiTestAssertions;
  cleanup_sql: string[];
  negative_cases: ApiTestNegativeCase[];
  generated_from_hash: string;
  ai_model: string;
  is_stale: boolean;
  last_run_result: ScriptRunResult | null;
  last_run_at: string | null;
  failure_count: number;
  generation_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

// --- Failure Guidance (v2) ---

export type GuidanceSeverity = 'critical' | 'major' | 'minor';
export type GuidanceCategory =
  | 'code_bug'
  | 'missing_feature'
  | 'data_issue'
  | 'permission_error'
  | 'contract_mismatch';

export interface LikelySource {
  file: string;
  function: string;
  line_hint: string;
}

export interface FailureGuidance {
  id: string;
  test_run_id: string | null;
  test_case_id: string;
  feature_id: string;
  tier: 'api' | 'e2e';
  root_cause: string;
  likely_source: LikelySource;
  suggested_fix: string;
  severity: GuidanceSeverity;
  category: GuidanceCategory;
  group_id: string | null;
  evidence: Record<string, unknown>;
  status: 'new' | 'fixing' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface GuidanceGroup {
  group_id: string;
  shared_root_cause: string;
  affected_test_count: number;
}

// --- Improvement Recommendations (v2) ---

export type RecommendationCategory =
  | 'performance'
  | 'ux'
  | 'accessibility'
  | 'coverage'
  | 'reliability';

export interface ImprovementRecommendation {
  id: string;
  feature_id: string;
  test_run_id: string | null;
  category: RecommendationCategory;
  observation: string;
  why_it_matters: string;
  suggested_action: string;
  priority: 'high' | 'medium' | 'low';
  status: 'new' | 'accepted' | 'dismissed' | 'deferred';
  created_at: string;
  resolved_at: string | null;
}

// --- Visual Checkpoint ---

export interface VisualAssessment {
  passed: boolean;
  explanation: string;
  visual_elements_found: string[];
  visual_elements_missing: string[];
  cosmetic_only: boolean;
  confidence: number;
}

export interface VisualCheckpoint {
  id: string;
  script_id: string;
  test_run_id: string | null;
  step_number: number;
  screenshot_base64: string;
  expected_outcome: string;
  ai_assessment: VisualAssessment;
  passed: boolean;
  cosmetic_only: boolean;
  created_at: string;
}

// --- Coverage ---

export interface TrendPoint {
  date: string;
  percentage: number;
}

export interface AutomationCoverage {
  feature_id: string;
  total_test_cases: number;
  automated_count: number;
  manual_count: number;
  stale_count: number;
  criteria_total: number;
  criteria_automated: number;
  coverage_percentage: number;
  trend: TrendPoint[];
  last_computed_at: string;
}

// --- API Response Types ---

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

export interface ScriptListItem {
  id: string;
  test_case_id: string;
  test_case_title: string;
  step_count: number;
  script_steps?: ScriptStep[];
  generation_source: GenerationSource;
  tier: 'api' | 'e2e';
  is_stale: boolean;
  is_custom_modified: boolean;
  last_run_result: ScriptRunResult | null;
  last_run_at: string | null;
  created_at: string;
}

// --- Guidance & Recommendation Response Types ---

export interface GuidanceListResult {
  guidance: Array<FailureGuidance & { test_case_title: string }>;
  groups: GuidanceGroup[];
}

export interface RecommendationListResult {
  recommendations: ImprovementRecommendation[];
}

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
