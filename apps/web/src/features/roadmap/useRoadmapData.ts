/** useRoadmapData - Roadmap state, data fetching, filtering, and action handlers. */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { productApi } from '../../lib/api-client';
import { apiClient } from '../../lib/supabase-client';
import { type TransitionRequest } from '../../components/roadmap/KanbanBoard';
import {
  dbToUiFeature,
  type ProductFeature,
  type FilterStatus,
  type FilterPriority,
  type FilterType,
  type FilterCategory,
  type FilterSection,
} from './roadmap-helpers';

export interface RoadmapStats {
  total: number;
  released: number;
  inDevelopment: number;
  approved: number;
  proposed: number;
}

export function useRoadmapData(featureParam?: string) {
  const [features, setFeatures] = useState<ProductFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterSection, setFilterSection] = useState<FilterSection>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const navigate = useNavigate();
  const featureRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoExpanded = useRef(false);

  // AI Copilot state (admin only)
  const isAdmin = useIsAdmin();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedFeatureForCopilot, setSelectedFeatureForCopilot] = useState<ProductFeature | null>(null);
  // Admin edit/delete state
  const [editingFeature, setEditingFeature] = useState<ProductFeature | null>(null);
  const [deletingFeature, setDeletingFeature] = useState<ProductFeature | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [linkingCriteriaFeature, setLinkingCriteriaFeature] = useState<ProductFeature | null>(null);

  // Kanban transition modal state
  const [pendingTransition, setPendingTransition] = useState<TransitionRequest | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchFeatures = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await productApi.getFeatures();
      if (response.data && response.data.length > 0) {
        setFeatures(response.data.map(dbToUiFeature));
      } else {
        setLoadError('No features found in database');
      }
    } catch (error) {
      console.error('Failed to fetch features from database:', error);
      setLoadError('Failed to load features from database');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  // Auto-expand and scroll to feature from URL param
  useEffect(() => {
    if (!featureParam || features.length === 0 || hasAutoExpanded.current) return;
    const target = features.find((f) => f.feature_code === featureParam);
    if (target) {
      hasAutoExpanded.current = true;
      setExpandedFeature(target.id);
      requestAnimationFrame(() => {
        featureRowRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [featureParam, features]);

  // Delete feature handler
  const handleDeleteFeature = useCallback(async (feature: ProductFeature) => {
    if (!feature) return;
    setIsDeleting(true);
    try {
      await apiClient(`roadmap-admin-features?feature_id=${feature.id}`, {
        method: 'DELETE',
      });
      await fetchFeatures();
      setDeletingFeature(null);
    } catch (error) {
      console.error('Failed to delete feature:', error);
      alert('Failed to delete feature. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [fetchFeatures]);

  // Derive unique sections for section filter
  const availableSections = Array.from(new Set(features.map((f) => f.spec_section || 'Other'))).sort();

  // Hide internal features from non-admin users
  const visibleFeatures = isAdmin ? features : features.filter((f) => f.category !== 'internal');

  const filteredFeatures = visibleFeatures.filter((feature) => {
    const matchesStatus = filterStatus === 'all' || feature.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || feature.priority === filterPriority;
    const matchesType = filterType === 'all' || feature.feature_type === filterType;
    const matchesCategory = filterCategory === 'all' ||
      (filterCategory === 'none' ? !feature.category : feature.category === filterCategory);
    const matchesSection = filterSection === 'all' || (feature.spec_section || 'Other') === filterSection;
    const matchesSearch =
      searchTerm === '' ||
      feature.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feature.feature_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feature.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesPriority && matchesType && matchesCategory && matchesSection && matchesSearch;
  });

  // Calculate stats
  const isFiltered = filterStatus !== 'all' || filterPriority !== 'all' || filterType !== 'all' || filterCategory !== 'all' || filterSection !== 'all' || searchTerm.trim() !== '';
  const stats: RoadmapStats = {
    total: filteredFeatures.length,
    released: filteredFeatures.filter((f) => f.status === 'released').length,
    inDevelopment: filteredFeatures.filter((f) => f.status === 'in_development').length,
    approved: filteredFeatures.filter((f) => f.status === 'approved').length,
    proposed: filteredFeatures.filter((f) => f.status === 'proposed').length,
  };

  // Group features by section, journeys first
  const groupedFeatures = filteredFeatures.reduce(
    (acc, feature) => {
      const section = feature.spec_section || 'Other';
      if (!acc[section]) acc[section] = [];
      acc[section].push(feature);
      return acc;
    },
    {} as Record<string, ProductFeature[]>
  );
  for (const section of Object.keys(groupedFeatures)) {
    groupedFeatures[section].sort((a, b) => {
      if (a.feature_type === 'journey' && b.feature_type !== 'journey') return -1;
      if (a.feature_type !== 'journey' && b.feature_type === 'journey') return 1;
      return 0;
    });
  }

  const toggleExpanded = useCallback((featureId: string) => {
    const isExpanding = expandedFeature !== featureId;
    setExpandedFeature(isExpanding ? featureId : null);

    const feature = features.find((f) => f.id === featureId);
    navigate({
      to: '/roadmap',
      search: { feature: isExpanding && feature ? feature.feature_code : undefined },
      replace: true,
      resetScroll: false,
    });

    if (isExpanding) {
      requestAnimationFrame(() => {
        featureRowRefs.current[featureId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (isAdmin && isExpanding && feature) {
      setSelectedFeatureForCopilot(feature);
    }
  }, [expandedFeature, features, isAdmin, navigate]);

  // Refresh features after copilot action
  const handleFeatureUpdated = useCallback(async () => {
    try {
      const response = await productApi.getFeatures();
      if (response.data && response.data.length > 0) {
        setFeatures(response.data.map(dbToUiFeature));
      }
    } catch (error) {
      console.error('Failed to refresh features:', error);
    }
  }, []);

  // Kanban handlers
  const handleTransitionRequest = useCallback((request: TransitionRequest) => {
    setPendingTransition(request);
  }, []);

  const handleTransitionConfirm = useCallback(async () => {
    if (!pendingTransition) return;
    const { featureId, toStatus } = pendingTransition;

    setIsTransitioning(true);
    setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, status: toStatus } : f)));
    try {
      await apiClient('roadmap-admin-features', {
        method: 'PATCH',
        body: JSON.stringify({ feature_id: featureId, status: toStatus }),
      });
    } catch (error) {
      console.error('Failed to update status:', error);
      await fetchFeatures();
    } finally {
      setIsTransitioning(false);
      setPendingTransition(null);
    }
  }, [pendingTransition, fetchFeatures]);

  const handleTransitionCancel = useCallback(() => {
    setPendingTransition(null);
  }, []);

  const handleKanbanFeatureClick = useCallback((featureId: string) => {
    setViewMode('list');
    setExpandedFeature(featureId);
    requestAnimationFrame(() => {
      featureRowRefs.current[featureId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterStatus('all');
    setFilterType('all');
    setFilterPriority('all');
    setFilterCategory('all');
    setFilterSection('all');
  }, []);

  return {
    // Data
    features,
    filteredFeatures,
    groupedFeatures,
    stats,
    isFiltered,
    availableSections,

    // Loading state
    isLoading,
    loadError,
    fetchFeatures,

    // View
    viewMode,
    setViewMode,
    expandedFeature,
    toggleExpanded,
    featureRowRefs,

    // Filters
    filterStatus,
    setFilterStatus,
    filterPriority,
    setFilterPriority,
    filterType,
    setFilterType,
    filterCategory,
    setFilterCategory,
    filterSection,
    setFilterSection,
    searchTerm,
    setSearchTerm,
    clearFilters,

    // Admin
    isAdmin,
    copilotOpen,
    setCopilotOpen,
    selectedFeatureForCopilot,
    editingFeature,
    setEditingFeature,
    deletingFeature,
    setDeletingFeature,
    isDeleting,
    handleDeleteFeature,
    linkingCriteriaFeature,
    setLinkingCriteriaFeature,
    handleFeatureUpdated,

    // Kanban
    pendingTransition,
    isTransitioning,
    handleTransitionRequest,
    handleTransitionConfirm,
    handleTransitionCancel,
    handleKanbanFeatureClick,
  };
}
