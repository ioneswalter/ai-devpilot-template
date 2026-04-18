/**
 * Product Roadmap API
 */

import { apiClient } from './api-helpers';

export interface TestCaseDB {
  id: string;
  test_code: string;
  title: string;
  description: string | null;
  test_type: string;
  priority: string;
  status: string;
  automated: boolean;
  passed: boolean | null;
}

export interface ProductFeatureDB {
  id: string;
  feature_code: string;
  title: string;
  description: string;
  acceptance_criteria: string[] | null;
  feature_type: string;
  priority: string;
  status: string;
  category: string | null;
  spec_section: string | null;
  related_user_stories: string[];
  implementing_features: Record<string, string[]> | null;
  created_at: string;
  updated_at: string;
  test_cases: TestCaseDB[];
}

export const productApi = {
  getFeatures: () =>
    apiClient<{ data: ProductFeatureDB[] }>('product/features', {
      method: 'GET',
    }),

  updateFeature: (id: string, data: Partial<ProductFeatureDB>) =>
    apiClient<{ data: ProductFeatureDB }>(`product/features/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateTestCase: (id: string, data: Partial<TestCaseDB>) =>
    apiClient<{ data: TestCaseDB }>(`product/test-cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createTestCase: (data: {
    feature_id: string;
    test_code: string;
    title: string;
    description?: string;
    test_type?: string;
    priority?: string;
    status?: string;
    automated?: boolean;
    passed?: boolean;
  }) =>
    apiClient<{ data: TestCaseDB }>('product/test-cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // FR-149: Feature versioning
  bumpVersion: (featureId: string, bumpType: 'minor' | 'major', changeSummary: string) =>
    apiClient<{ data: VersionBumpResponse }>('feature-versions', {
      method: 'POST',
      body: JSON.stringify({ feature_id: featureId, bump_type: bumpType, change_summary: changeSummary }),
    }),

  getVersions: (featureId: string) =>
    apiClient<{ data: VersionListResponse }>(`feature-versions?feature_id=${featureId}`, {
      method: 'GET',
    }),

  compareVersions: (v1: string, v2: string) =>
    apiClient<{ data: VersionCompareResponse }>(`feature-versions?action=compare&v1=${v1}&v2=${v2}`, {
      method: 'GET',
    }),
};

// FR-149 types
export interface FeatureVersionDB {
  id: string;
  version_number: number;
  version_label: string | null;
  status: string | null;
  change_summary: string | null;
  changed_by: string | null;
  created_at: string;
  superseded_by: string | null;
}

export interface VersionBumpResponse {
  id: string;
  feature_id: string;
  version_number: number;
  version_label: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  status: string;
  change_summary: string;
  created_at: string;
  archived_version: {
    id: string;
    version_label: string;
    superseded_by: string;
  } | null;
}

export interface VersionListResponse {
  versions: FeatureVersionDB[];
  current_version: string | null;
  total: number;
}

export interface VersionCompareResponse {
  v1: { id: string; version_label: string; title: string; description: string | null; acceptance_criteria: string[]; created_at: string };
  v2: { id: string; version_label: string; title: string; description: string | null; acceptance_criteria: string[]; created_at: string };
  diff: {
    title: { changed: boolean };
    description: { changed: boolean };
    acceptance_criteria: { added: string[]; removed: string[]; unchanged: string[] };
  };
}
