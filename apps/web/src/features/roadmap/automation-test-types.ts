/**
 * API verification test, failure guidance, recommendations, visual checkpoint,
 * and coverage types (FR-109 v2)
 */

import type { ScriptRunResult } from './automation-script-types';

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
