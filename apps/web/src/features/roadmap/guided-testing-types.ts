/** TypeScript types for AI Testing Co-Pilot (FR-108) */

// ── Page State (captured by browser extension) ──

export interface ElementInfo {
  tag: string;
  id?: string;
  class?: string;
  text?: string;
  role?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface PageState {
  url: string;
  title: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  visible_elements: ElementInfo[];
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  duration_ms: number;
  error?: string;
}

// ── AI Guidance (from generate-guidance API) ──

export interface GuidedStep {
  step_number: number;
  action: string;
  target_element: string;
  expected_outcome: string;
  criterion_id: string;
  criterion_text: string;
  requires_navigation?: string;
}

export interface GenerateGuidanceRequest {
  feature_id: string;
  test_case_id: string;
  page_state: PageState;
}

export interface GenerateGuidanceResponse {
  session_id: string;
  steps: GuidedStep[];
  total_steps: number;
  model_used: string;
}

// ── Validation (from validate-state API) ──

export interface ValidateStateRequest {
  session_id: string;
  step_number: number;
  expected_outcome: string;
  actual_page_state: PageState;
  console_errors?: string[];
  failed_requests?: NetworkEntry[];
}

export interface ValidationResult {
  matches_expected: boolean;
  confidence: number;
  explanation: string;
  mismatches: string[];
  console_issues: string[];
  network_issues: string[];
}

// ── Evidence (captured at each step) ──

export interface StepEvidence {
  step_number: number;
  timestamp: string;
  criterion_id: string;
  criterion_text: string;
  action: string;
  expected_outcome: string;
  actual_outcome: string;
  verdict: 'passed' | 'failed' | 'skipped';
  override: boolean;
  screenshot?: string;
  page_state?: PageState;
  console_output?: string[];
  network_log?: NetworkEntry[];
  validation?: ValidationResult;
}

export interface GuidedTestEvidence {
  type: 'guided';
  session_id: string;
  steps: StepEvidence[];
}

// ── Exploratory Suggestions (from suggest-exploratory API) ──

export interface ExploratorySuggestion {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expected_outcome: string;
  related_criterion?: string;
  overlaps_with?: string;
}

export interface SuggestExploratoryRequest {
  session_id: string;
  feature_id: string;
  failure_context: {
    step_number: number;
    action: string;
    expected_outcome: string;
    actual_outcome: string;
    console_errors?: string[];
    failed_requests?: NetworkEntry[];
    page_state: PageState;
  };
  existing_test_codes: string[];
}

// ── Session Management ──

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface GuidedTestSession {
  id: string;
  feature_id: string;
  test_case_id: string;
  admin_id: string;
  status: SessionStatus;
  total_steps: number;
  completed_steps: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  ai_model: string;
}

// ── Extension Bridge ──

export interface ExtensionCapabilities {
  screenshot: boolean;
  dom: boolean;
  console: boolean;
  network: boolean;
}

export interface CaptureEvidenceResult {
  screenshot: string;
  page_state: PageState;
  console_output: string[];
  network_log: NetworkEntry[];
  timestamp: string;
}

// ── Criteria Coverage ──

export type CriterionStatus = 'passed' | 'failed' | 'untested';

export interface CriterionCoverage {
  index: number;
  text: string;
  status: CriterionStatus;
  test_case_code?: string;
  test_case_id?: string;
  evidence_date?: string;
}

export interface CoverageSummary {
  total: number;
  passed: number;
  failed: number;
  untested: number;
  percentage: number;
  criteria: CriterionCoverage[];
}
