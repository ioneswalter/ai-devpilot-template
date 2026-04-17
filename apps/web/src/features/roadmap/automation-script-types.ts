/**
 * Script step types and automated test script interfaces (FR-109 v2)
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
  generation_notes: string | null;
  created_at: string;
}
