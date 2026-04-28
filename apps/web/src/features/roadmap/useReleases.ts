/**
 * TanStack Query hooks for release management
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReleases,
  createRelease,
  updateRelease,
  deployRelease,
  generateReleaseNotes,
} from '@/lib/api/admin-api';

export interface Release {
  id: string;
  version: string;
  name: string;
  description?: string;
  release_type: string;
  status: string;
  target_date?: string;
  released_at?: string;
  release_notes?: string;
  changelog?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  released_by?: string;
  features?: Array<{
    id: string;
    feature_id: string;
    implementation_status: string;
    feature_code?: string;
    title?: string;
    status?: string;
  }>;
}

const RELEASES_KEY = ['releases'] as const;

export function useReleases() {
  return useQuery<Release[]>({
    queryKey: RELEASES_KEY,
    queryFn: async () => (await getReleases()) as Release[],
  });
}

export function useCreateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRelease,
    onSettled: () => qc.invalidateQueries({ queryKey: RELEASES_KEY }),
  });
}

export function useUpdateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRelease,
    onSettled: () => qc.invalidateQueries({ queryKey: RELEASES_KEY }),
  });
}

export function useDeployRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deployRelease,
    onSettled: () => qc.invalidateQueries({ queryKey: RELEASES_KEY }),
  });
}

export function useGenerateReleaseNotes() {
  return useMutation({ mutationFn: generateReleaseNotes });
}
