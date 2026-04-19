/**
 * Pipeline API — orchestrator, deploy progress, escalation, CI,
 * readiness, notifications, and learning insights.
 */

import { apiClient } from './api-helpers';
import type { PipelineStatusResponse } from '@/features/roadmap/pipeline-types';
import type { LearningInsights } from './test-api';

// ── Pipeline adminApi methods ──

export const pipelineApiMethods = {
  // Pipeline Status (FR-111)
  getPipelineStatus: (featureId?: string, versionId?: string) => {
    const params = new URLSearchParams();
    if (featureId) params.set('feature_id', featureId);
    if (versionId) params.set('version_id', versionId);
    const qs = params.toString();
    return apiClient<PipelineStatusResponse>(
      `pipeline-status${qs ? `?${qs}` : ''}`,
    );
  },

  // Pipeline Orchestrator (FR-113)
  startPipeline: (featureId: string, requestId: string) =>
    apiClient<{ data: { pipeline_id: string; total_tasks: number; status: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'start', feature_id: featureId, request_id: requestId }),
      },
    ),

  cancelPipeline: (pipelineId: string) =>
    apiClient<{ data: { pipeline_id: string; status: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel', pipeline_id: pipelineId }),
      },
    ),

  getPipelineRunStatus: (featureId: string) =>
    apiClient<{ data: PipelineRunStatus }>(
      `pipeline-orchestrator?feature_id=${featureId}`,
    ),

  // Re-run CI validation (FR-114)
  rerunCI: (pipelineId: string) =>
    apiClient<{ data: { pipeline_id: string; status: string; stage: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'rerun-ci', pipeline_id: pipelineId }),
      },
    ),

  // Re-deploy (FR-115)
  redeploy: (pipelineId: string) =>
    apiClient<{ data: { pipeline_id: string; status: string; stage: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'redeploy', pipeline_id: pipelineId }),
      },
    ),

  // Re-run readiness (FR-116)
  rerunReadiness: (pipelineId: string) =>
    apiClient<{ data: { pipeline_id: string; status: string; stage: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'rerun-readiness', pipeline_id: pipelineId }),
      },
    ),

  // Deploy Progress (FR-142)
  getDeployProgress: (pipelineId: string) =>
    apiClient<{ data: DeployProgressResponse }>(
      `pipeline-orchestrator?action=deploy-progress&pipeline_id=${pipelineId}`,
    ),

  acknowledgeEscalation: (escalationId: string) =>
    apiClient<{ data: { escalation_id: string; status: string; pipeline_stage: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'acknowledge-escalation', escalation_id: escalationId }),
      },
    ),

  resolveEscalation: (escalationId: string, resolutionNotes: string) =>
    apiClient<{ data: { escalation_id: string; status: string; pipeline_stage: string } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve-escalation', escalation_id: escalationId, resolution_notes: resolutionNotes }),
      },
    ),

  // Notifications (FR-116)
  getNotifications: (unreadOnly = true) =>
    apiClient<{ data: PipelineNotification[] }>(
      `pipeline-orchestrator?action=notifications${unreadOnly ? '&unread=true' : ''}`,
    ),

  markNotificationRead: (notificationId: string) =>
    apiClient<{ data: { id: string; read: boolean } }>(
      'pipeline-orchestrator',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'mark-notification-read', notification_id: notificationId }),
      },
    ),

  // Learning Insights (FR-118)
  getLearningInsights: () =>
    apiClient<{ data: LearningInsights }>('pipeline-orchestrator?action=learning-insights'),

  approveRecommendation: (recommendationId: string) =>
    apiClient<{ data: { id: string; status: string } }>(
      'pipeline-orchestrator',
      { method: 'POST', body: JSON.stringify({ action: 'approve-recommendation', recommendation_id: recommendationId }) },
    ),

  dismissRecommendation: (recommendationId: string) =>
    apiClient<{ data: { id: string; status: string } }>(
      'pipeline-orchestrator',
      { method: 'POST', body: JSON.stringify({ action: 'dismiss-recommendation', recommendation_id: recommendationId }) },
    ),
};

// ── Pipeline Run Types (FR-113) ──

export interface FixAttempt {
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  error: string | null;
  timestamp: string;
}

export interface DeployStepResult {
  artifact: string;
  action: 'execute_sql' | 'deploy_function';
  status: 'success' | 'failed' | 'skipped' | 'pending' | 'running' | 'manual_override';
  duration_ms: number;
  error: string | null;
  details: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  retry_count?: number;
  fix_attempts?: FixAttempt[];
}

export interface DeployResults {
  migrations: DeployStepResult[];
  functions: DeployStepResult[];
  started_at: string;
  completed_at: string;
  overall_status: 'success' | 'partial' | 'failed' | 'pending';
}

export interface DeployEscalation {
  id: string;
  step_type: 'migration' | 'function';
  step_artifact: string;
  error_message: string;
  fix_attempts_count: number;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface DeployProgressResponse {
  pipeline_id: string;
  feature_id: string;
  feature_code: string;
  current_stage: string;
  deploy_results: DeployResults | null;
  escalations: DeployEscalation[];
  deploy_lock: {
    acquired: boolean;
    acquired_at: string | null;
    expires_at: string | null;
  } | null;
  queue_position: number | null;
  last_heartbeat: string | null;
}

export interface CIStageResult {
  passed: boolean;
  attempts: Array<{
    errors: Array<{ file: string; line: number; message: string; code: string }>;
    fix_applied: boolean;
    fixed_files?: string[];
    timestamp: string;
  }>;
}

export interface CIResults {
  typecheck: CIStageResult;
  lint: CIStageResult;
  test: CIStageResult;
}

// FR-116: Readiness Results Types
export interface ReadinessStepResult {
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  errors: string[];
}

export interface SeedDataResult extends ReadinessStepResult {
  records: number;
}

export interface TestCaseResult extends ReadinessStepResult {
  created: number;
  skipped: number;
}

export interface ReadinessResults {
  seed_data: SeedDataResult;
  test_cases: TestCaseResult;
  status_update: { status: 'success' | 'failed'; from: string; to: string };
  started_at: string;
  completed_at: string;
  overall_status: 'success' | 'partial' | 'failed';
}

// FR-116: Pipeline Notification Types
export interface PipelineNotification {
  id: string;
  feature_id: string;
  pipeline_id: string;
  type: 'test_ready' | 'readiness_failed' | 'uat_ready';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  feature_id: string;
  request_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  current_stage: string;
  current_task_id: string | null;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  logs: Array<{ timestamp: string; level: string; message: string; task_id?: string }>;
  ci_results: CIResults | null;
  deploy_results: DeployResults | null;
  readiness_results: ReadinessResults | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  last_heartbeat: string;
}

export interface PipelineRunStatus {
  active: PipelineRun | null;
  current_task: { id: string; title: string; file_path: string; implementation_status: string } | null;
  history: PipelineRun[];
}
