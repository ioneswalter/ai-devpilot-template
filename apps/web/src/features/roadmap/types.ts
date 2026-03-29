/**
 * Release management types and validation schemas for the roadmap feature
 */

import { z } from 'zod';

// Release type constants
export const ReleaseType = {
  MAJOR: 'major',
  MINOR: 'minor',
  PATCH: 'patch',
  HOTFIX: 'hotfix',
} as const;
export type ReleaseType = (typeof ReleaseType)[keyof typeof ReleaseType];

export const ReleaseStatus = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  DEPLOYED: 'deployed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
} as const;
export type ReleaseStatus = (typeof ReleaseStatus)[keyof typeof ReleaseStatus];

export const FeatureImpactLevel = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;
export type FeatureImpactLevel = (typeof FeatureImpactLevel)[keyof typeof FeatureImpactLevel];

// Base types
export interface Feature {
  id: string;
  title: string;
  description: string;
  status: string;
  impact_level: FeatureImpactLevel;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface Release {
  id: string;
  name: string;
  version: string;
  type: ReleaseType;
  status: ReleaseStatus;
  description?: string;
  release_notes: string;
  scheduled_at?: string;
  deployed_at?: string;
  rolled_back_at?: string;
  feature_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseFeature {
  release_id: string;
  feature_id: string;
  feature: Feature;
  added_at: string;
}

// Form types
export interface CreateReleaseFormData {
  name: string;
  type: ReleaseType;
  description?: string;
  feature_ids: string[];
  scheduled_at?: string;
  auto_generate_notes: boolean;
}

export interface CreateReleaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReleaseFormData) => Promise<void>;
  availableFeatures: Feature[];
  suggestedVersion?: string;
  isLoading?: boolean;
}

export interface UpdateReleaseFormData {
  name?: string;
  description?: string;
  release_notes?: string;
  scheduled_at?: string;
  feature_ids?: string[];
}

// Validation schemas
export const createReleaseSchema = z.object({
  name: z.string()
    .min(1, 'Release name is required')
    .max(100, 'Release name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Release name contains invalid characters'),
  
  type: z.enum([ReleaseType.MAJOR, ReleaseType.MINOR, ReleaseType.PATCH, ReleaseType.HOTFIX], {
    errorMap: () => ({ message: 'Please select a valid release type' })
  }),
  
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  
  feature_ids: z.array(z.string().uuid('Invalid feature ID'))
    .min(1, 'At least one feature must be selected')
    .max(50, 'Cannot include more than 50 features in a single release'),
  
  scheduled_at: z.string()
    .datetime('Invalid date format')
    .optional()
    .refine((date) => {
      if (!date) return true;
      return new Date(date) > new Date();
    }, 'Scheduled date must be in the future'),
  
  auto_generate_notes: z.boolean().default(true)
});

export const updateReleaseSchema = z.object({
  name: z.string()
    .min(1, 'Release name is required')
    .max(100, 'Release name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Release name contains invalid characters')
    .optional(),
  
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  
  release_notes: z.string()
    .max(5000, 'Release notes must be 5000 characters or less')
    .optional(),
  
  scheduled_at: z.string()
    .datetime('Invalid date format')
    .optional()
    .refine((date) => {
      if (!date) return true;
      return new Date(date) > new Date();
    }, 'Scheduled date must be in the future'),
  
  feature_ids: z.array(z.string().uuid('Invalid feature ID'))
    .min(1, 'At least one feature must be selected')
    .max(50, 'Cannot include more than 50 features in a single release')
    .optional()
});

export const versionSchema = z.string()
  .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (e.g., 1.2.3)');

// Component prop types
export interface ReleaseDetailViewProps {
  releaseId: string;
  onClose: () => void;
  onEdit: (release: Release) => void;
  onDeploy: (releaseId: string) => void;
  onRollback: (releaseId: string) => void;
}

export interface ReleasePanelProps {
  selectedReleaseId?: string;
  onSelectRelease: (releaseId: string | undefined) => void;
  onCreateRelease: () => void;
}

export interface ReleaseListViewProps {
  releases: Release[];
  onSelectRelease: (releaseId: string) => void;
  selectedReleaseId?: string;
  isLoading?: boolean;
}

export interface FeatureSelectorProps {
  features: Feature[];
  selectedFeatureIds: string[];
  onSelectionChange: (featureIds: string[]) => void;
  disabled?: boolean;
}

export interface ReleaseNotesEditorProps {
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export interface ReleaseFeatureListProps {
  features: Feature[];
  onRemoveFeature?: (featureId: string) => void;
  readOnly?: boolean;
}

export interface ReleaseHistoryProps {
  releases: Release[];
  isLoading?: boolean;
  onViewRelease: (releaseId: string) => void;
}

// API response types
export interface CreateReleaseResponse {
  release: Release;
  suggested_version: string;
}

export interface GetReleasesResponse {
  releases: Release[];
  total: number;
  page: number;
  limit: number;
}

export interface DeployReleaseResponse {
  release: Release;
  deployment_id: string;
  status: 'success' | 'failed';
  message?: string;
}

export interface GenerateNotesResponse {
  release_notes: string;
  feature_count: number;
  categories: string[];
}

// Utility types
export type ReleaseFormErrors = {
  [K in keyof CreateReleaseFormData]?: string;
};

export interface ReleaseFilters {
  status?: ReleaseStatus[];
  type?: ReleaseType[];
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface VersionSuggestion {
  version: string;
  type: ReleaseType;
  reason: string;
}