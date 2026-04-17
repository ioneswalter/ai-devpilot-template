/**
 * Feature API — admin dashboard, LMS, course builder, spec review,
 * implementation, build errors, and release management.
 */

import { apiClient } from './api-helpers';
import type {
  StartReviewResponse, GetReviewResponse, UpdateReviewRequest,
  UpdateReviewResponse, ApproveReviewResponse, SendBackResponse,
} from '@/features/roadmap/spec-review-types';
import type {
  AdminOverviewData, AdminUsersData, AdminFeedData, AdminVerificationsData,
  LmsOverviewData, LmsCourseDetailData, LmsUserProgressData,
} from '@/features/admin/types';
import type { FixAuditRecord } from '@/lib/schemas/fix-audit';

export const featureApiMethods = {
  getOverview: () =>
    apiClient<{ data: AdminOverviewData }>('admin-dashboard?section=overview', {
      method: 'GET',
    }),

  getUsers: (params?: { search?: string; sort?: string; order?: string; page?: number }) => {
    const qs = new URLSearchParams();
    qs.set('section', 'users');
    if (params?.search) qs.set('search', params.search);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.order) qs.set('order', params.order);
    if (params?.page) qs.set('page', params.page.toString());
    return apiClient<{ data: AdminUsersData }>(`admin-dashboard?${qs.toString()}`, {
      method: 'GET',
    });
  },

  getFeed: (before?: string) =>
    apiClient<{ data: AdminFeedData }>(
      `admin-dashboard?section=feed${before ? '&before=' + before : ''}`,
      { method: 'GET' },
    ),

  getVerifications: () =>
    apiClient<{ data: AdminVerificationsData }>('admin-dashboard?section=verifications', {
      method: 'GET',
    }),

  updateVerificationStatus: (providerId: string, status: 'APPROVED' | 'REJECTED', reason?: string) =>
    apiClient<{ data: { provider_id: string; status: string } }>('admin-dashboard?section=verify', {
      method: 'POST',
      body: JSON.stringify({ provider_id: providerId, status, reason }),
    }),

  getCurrencyConfigs: () =>
    apiClient<{ data: { configs: import('@/features/admin/CurrencyConfigPanel').CurrencyConfigRow[] } }>(
      'admin-dashboard?section=currency_config',
      { method: 'GET' },
    ),

  updateCurrencyConfig: (id: string, updates: Record<string, unknown>) =>
    apiClient<{ data: { id: string } }>('admin-dashboard?section=currency_config', {
      method: 'POST',
      body: JSON.stringify({ id, ...updates }),
    }),

  updateUser: (userId: string, updates: Record<string, unknown>) =>
    apiClient<{ data: { user_id: string; updated: boolean } }>('admin-dashboard?section=update_user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...updates }),
    }),

  blockUser: (userId: string, blocked: boolean) =>
    apiClient<{ data: { user_id: string; is_blocked: boolean } }>('admin-dashboard?section=block_user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, blocked }),
    }),

  // LMS Admin Dashboard (FR-104)
  getLmsOverview: (params?: { category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    qs.set('section', 'lms_overview');
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    return apiClient<{ data: LmsOverviewData }>(`admin-dashboard?${qs.toString()}`, { method: 'GET' });
  },

  getLmsCourseDetail: (courseId: string) =>
    apiClient<{ data: LmsCourseDetailData }>(`admin-dashboard?section=lms_course_detail&course_id=${courseId}`, { method: 'GET' }),

  getLmsUserProgress: (enrollmentId: string) =>
    apiClient<{ data: LmsUserProgressData }>(`admin-dashboard?section=lms_user_progress&enrollment_id=${enrollmentId}`, { method: 'GET' }),

  // Spec Artifacts (FR-104)
  getSpecArtifacts: (featureId: string) =>
    apiClient<{ data: { artifacts: SpecArtifact[] } }>(`admin-dashboard?section=spec_artifacts&feature_id=${featureId}`, { method: 'GET' }),

  // Course Builder (FR-122)
  getCourseList: (params?: { category?: string; search?: string; status?: string }) => {
    const qs = new URLSearchParams({ section: 'course_list' });
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    return apiClient<{ data: { courses: unknown[] } }>(`admin-dashboard?${qs}`, { method: 'GET' });
  },

  getCourseDetail: (courseId: string) =>
    apiClient<{ data: { course: unknown; modules: unknown[] } }>(`admin-dashboard?section=course_detail&course_id=${courseId}`, { method: 'GET' }),

  saveCourse: (data: Record<string, unknown>) =>
    apiClient<{ data: { course: { id: string; title: string; status: string } } }>('admin-dashboard?section=course_save', {
      method: 'POST', body: JSON.stringify(data),
    }),

  saveModule: (data: Record<string, unknown>) =>
    apiClient<{ data: { module: { id: string; title: string; sort_order: number } } }>('admin-dashboard?section=module_save', {
      method: 'POST', body: JSON.stringify(data),
    }),

  deleteModule: (moduleId: string) =>
    apiClient<{ data: { deleted: boolean } }>('admin-dashboard?section=module_delete', {
      method: 'POST', body: JSON.stringify({ module_id: moduleId }),
    }),

  reorderModules: (courseId: string, moduleIds: string[]) =>
    apiClient<{ data: { reordered: boolean } }>('admin-dashboard?section=module_reorder', {
      method: 'POST', body: JSON.stringify({ course_id: courseId, module_ids: moduleIds }),
    }),

  getQuizQuestions: (moduleId: string) =>
    apiClient<{ data: { questions: unknown[] } }>(`admin-dashboard?section=quiz_questions&module_id=${moduleId}`, { method: 'GET' }),

  saveQuiz: (moduleId: string, questions: unknown[]) =>
    apiClient<{ data: { saved: number } }>('admin-dashboard?section=quiz_save', {
      method: 'POST', body: JSON.stringify({ module_id: moduleId, questions }),
    }),

  getTemplateList: () =>
    apiClient<{ data: { templates: unknown[] } }>('admin-dashboard?section=template_list', { method: 'GET' }),

  applyTemplate: (courseId: string, templateId: string) =>
    apiClient<{ data: { modules_added: number } }>('admin-dashboard?section=template_apply', {
      method: 'POST', body: JSON.stringify({ course_id: courseId, template_id: templateId }),
    }),

  generateOutline: (topic: string, category?: string) =>
    apiClient<{ data: { modules: unknown[]; model: string } }>('course-ai?section=generate_outline', {
      method: 'POST', body: JSON.stringify({ topic, category, module_count_hint: 5 }),
    }),

  generateQuiz: (moduleId: string, content: string, questionCount = 5) =>
    apiClient<{ data: { questions: unknown[]; model: string } }>('course-ai?section=generate_quiz', {
      method: 'POST', body: JSON.stringify({ module_id: moduleId, content, question_count: questionCount }),
    }),

  moderateContent: (content: string, moduleTitle: string) =>
    apiClient<{ data: { warnings: unknown[] } }>('course-ai?section=moderate_content', {
      method: 'POST', body: JSON.stringify({ content, module_title: moduleTitle }),
    }),

  // Spec Review (FR-091)
  startReview: (featureId: string) =>
    apiClient<{ data: StartReviewResponse }>('spec-review', {
      method: 'POST',
      body: JSON.stringify({ feature_id: featureId }),
    }),

  getReview: (featureId: string, includeHistory = false) =>
    apiClient<{ data: GetReviewResponse }>(
      `spec-review?feature_id=${featureId}${includeHistory ? '&include_history=true' : ''}`,
    ),

  updateReview: (data: UpdateReviewRequest) =>
    apiClient<{ data: UpdateReviewResponse }>('spec-review', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  approveReview: (reviewId: string, version: number) =>
    apiClient<{ data: ApproveReviewResponse }>('spec-review?action=approve', {
      method: 'POST',
      body: JSON.stringify({ review_id: reviewId, version }),
    }),

  sendBackReview: (reviewId: string, version: number, feedback: string) =>
    apiClient<{ data: SendBackResponse }>('spec-review?action=send-back', {
      method: 'POST',
      body: JSON.stringify({ review_id: reviewId, version, feedback }),
    }),

  // Implementation (FR-105)
  requestImplementation: (featureId: string, notes?: string) =>
    apiClient<{ data: ImplementationRequestWithItems }>('implement-feature', {
      method: 'POST',
      body: JSON.stringify({ feature_id: featureId, implementation_notes: notes }),
    }),

  getImplementation: (featureId: string) =>
    apiClient<{ data: ImplementationRequestWithItems }>(`implement-feature?feature_id=${featureId}`),

  updateTaskItem: (data: { item_id: string; decision?: string; title?: string; description?: string; comment?: string }) =>
    apiClient<{ data: ImplementationTaskItem }>('implement-feature', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** Process ONE next task -- call repeatedly until done */
  implementNextTask: (requestId: string, fileContexts?: Record<string, string>) =>
    apiClient<{ data: { done: boolean; remaining: number; task_id?: string; status?: string } }>('implement-feature?action=implement', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, ...(fileContexts ? { file_contexts: fileContexts } : {}) }),
    }),

  addTaskItem: (data: { request_id: string; title: string; description?: string; file_path: string; task_type: string }) =>
    apiClient<{ data: ImplementationTaskItem }>('implement-feature?action=add-task', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  markCodeApplied: (requestId: string) =>
    apiClient<{ data: { code_applied: boolean } }>('implement-feature?action=mark-applied', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    }),

  /** AI-powered build error fixer -- supports typecheck, lint, and test errors */
  fixBuildErrors: (data: { errors: BuildErrorItem[]; files: FileContentItem[]; stage?: string }) =>
    apiClient<{ data: { fixes: FixResultItem[]; error_count: number } }>('implement-feature?action=fix-errors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Release Feature (FR-146)
  releaseFeature: (featureId: string) =>
    apiClient<Record<string, unknown>>('roadmap-admin-features', {
      method: 'PATCH',
      body: JSON.stringify({ feature_id: featureId, status: 'released' }),
    }),
};

// ── Spec Artifact Types ──
export interface SpecArtifact {
  id: string;
  artifact_type: string;
  file_name: string;
  content: string;
  created_at: string;
  updated_at: string | null;
}

// ── Build Error Types ──
export interface BuildErrorItem {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

export interface FileContentItem { path: string; content: string }

export interface FixResultItem { path: string; code: string; changes: string }

// ── FR-117: Complexity Score Types ──
export interface ComplexityFactorResult {
  score: number;
  value: number | string[];
  detail: string;
}

export interface ComplexityScore {
  total: number; threshold: number; split_recommended: boolean;
  factors: Record<string, ComplexityFactorResult>; scored_at: string;
}

export interface ImplementationTaskItem {
  id: string;
  request_id: string;
  title: string;
  description: string | null;
  file_path: string;
  task_type: 'create' | 'modify' | 'test' | 'config';
  source: 'ai_generated' | 'manual';
  decision: 'pending' | 'accepted' | 'rejected' | 'modified';
  decided_by: string | null;
  decided_at: string | null;
  comments: Array<{ user_id: string; user_name: string; text: string; created_at: string }> | null;
  sort_order: number;
  created_at: string;
  implementation_status: 'pending' | 'generating' | 'completed' | 'failed' | 'split';
  generated_code: string | null;
  ai_log: string | null;
  complexity_score: ComplexityScore | null;
  fix_audit_trail: FixAuditRecord[] | null;
}

export interface ImplementationRequestWithItems {
  id: string; feature_id: string; requested_by: string;
  requested_by_name: string | null; status: string;
  implementation_notes: string | null; implementation_prompt: string | null;
  ai_response: { summary: string; architecture_notes: string } | null;
  error_message: string | null; created_at: string; completed_at: string | null;
  code_applied: boolean; code_applied_at: string | null;
  task_items: ImplementationTaskItem[];
}
