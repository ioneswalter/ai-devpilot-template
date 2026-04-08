/**
 * Shared types for AI-Powered Test Automation (FR-109)
 */

// --- Script Step Types ---

export type ScriptAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'wait'
  | 'assert_text'
  | 'assert_visible'
  | 'assert_not_visible'
  | 'screenshot'
  | 'select'
  | 'hover';

export type TargetStrategy = 'text' | 'role' | 'label' | 'testid' | 'url';

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
}

// --- Automated Test Script ---

export type GenerationSource = 'ai_criteria' | 'manual_conversion' | 'manual_edit';
export type ScriptRunResult = 'passed' | 'failed' | 'error';
export type AutomationStatus = 'manual' | 'automated' | 'stale' | 'converting';

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
  created_at: string;
  updated_at: string;
  created_by: string;
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

export interface GenerateScriptsResult {
  generated: Array<{
    test_case_id: string;
    script_id: string;
    step_count: number;
    criterion_refs: number[];
  }>;
  skipped: Array<{
    test_case_id: string;
    reason: string;
  }>;
  total_generated: number;
  total_skipped: number;
}

export interface ExecuteScriptResult {
  script_id: string;
  result: ScriptRunResult;
  steps_completed: number;
  steps_total: number;
  duration_ms: number;
  failures: Array<{
    step_number: number;
    expected: string;
    actual: string;
    screenshot_base64?: string;
  }>;
  visual_checkpoints: Array<{
    step_number: number;
    passed: boolean;
    cosmetic_only: boolean;
    explanation: string;
  }>;
}

export interface ExecuteSuiteResult {
  feature_id: string;
  total_scripts: number;
  passed: number;
  failed: number;
  errors: number;
  skipped_stale: number;
  duration_ms: number;
  is_release_ready: boolean;
  results: Array<{
    script_id: string;
    test_case_id: string;
    result: 'passed' | 'failed' | 'error' | 'skipped';
    duration_ms: number;
  }>;
}

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
  is_stale: boolean;
  is_custom_modified: boolean;
  last_run_result: ScriptRunResult | null;
  last_run_at: string | null;
  created_at: string;
}
