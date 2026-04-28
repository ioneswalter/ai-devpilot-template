/**
 * TypeScript types for release management functionality
 */

export type ReleaseStatus = 'draft' | 'ready' | 'deployed' | 'failed' | 'rolled_back';

export type ReleaseVersion = {
  major: number;
  minor: number;
  patch: number;
};

export interface Release {
  id: string;
  name: string;
  version: string;
  status: ReleaseStatus;
  description: string | null;
  release_notes: string | null;
  scheduled_deploy_at: string | null;
  deployed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  total_features?: number;
  rollback_deadline?: string | null;
  deployment_target?: string | null;
}

export interface ReleaseFeature {
  id: string;
  release_id: string;
  feature_id: string;
  added_at: string;
  feature?: {
    id: string;
    title: string;
    description: string | null;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    category: string | null;
    impact_level?: 'minor' | 'major' | 'breaking';
  };
}

export interface ReleaseFormData {
  name: string;
  version: string;
  description?: string;
  feature_ids: string[];
  scheduled_deploy_at?: string;
  deployment_target?: string;
}

export interface ReleaseNotesData {
  summary: string;
  new_features: ReleaseNoteItem[];
  improvements: ReleaseNoteItem[];
  bug_fixes: ReleaseNoteItem[];
  breaking_changes: ReleaseNoteItem[];
  migration_notes?: string;
}

export interface ReleaseNoteItem {
  title: string;
  description: string;
  feature_id: string;
  impact_level: 'minor' | 'major' | 'breaking';
}

export interface CreateReleaseRequest {
  name: string;
  version: string;
  description?: string;
  feature_ids: string[];
  scheduled_deploy_at?: string;
  deployment_target?: string;
}

export interface UpdateReleaseRequest {
  name?: string;
  description?: string;
  release_notes?: string;
  scheduled_deploy_at?: string;
  status?: ReleaseStatus;
}

export interface DeployReleaseRequest {
  release_id: string;
  deployment_target?: string;
}

export interface ReleaseDeployment {
  id: string;
  release_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  deployment_target: string;
  rollback_available: boolean;
}

export interface AvailableFeature {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  completed_at: string | null;
  impact_level?: 'minor' | 'major' | 'breaking';
  has_dependencies: boolean;
  dependency_conflicts?: string[];
}

export interface ReleaseHistoryItem {
  id: string;
  name: string;
  version: string;
  deployed_at: string;
  feature_count: number;
  deployment_target: string;
  rollback_available: boolean;
}

export interface VersionSuggestion {
  suggested_version: string;
  version_type: 'patch' | 'minor' | 'major';
  reasoning: string;
  breaking_changes: boolean;
}
