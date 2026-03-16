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
};
