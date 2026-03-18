/**
 * AdminModals - Delete confirmation, edit form, criteria linking,
 * and kanban transition modals for admin users.
 */

import { AdminFeatureEditForm } from '../../components/AdminFeatureEditForm';
import { AdminCriteriaFeatureLink } from '../../components/AdminCriteriaFeatureLink';
import { TransitionConfirmModal } from '../../components/roadmap/TransitionConfirmModal';
import type { TransitionRequest } from '../../components/roadmap/KanbanBoard';
import type { ProductFeature } from './roadmap-helpers';

interface AdminModalsProps {
  features: ProductFeature[];
  editingFeature: ProductFeature | null;
  onCloseEdit: () => void;
  onEditSuccess: () => void;
  deletingFeature: ProductFeature | null;
  isDeleting: boolean;
  onCloseDeletion: () => void;
  onConfirmDelete: (feature: ProductFeature) => void;
  linkingCriteriaFeature: ProductFeature | null;
  onCloseLinkCriteria: () => void;
  onLinkCriteriaSuccess: () => void;
  pendingTransition: TransitionRequest | null;
  isTransitioning: boolean;
  onTransitionConfirm: () => void;
  onTransitionCancel: () => void;
  onReviewWithAI?: (feature: ProductFeature) => void;
  onStartImplementation?: (feature: ProductFeature) => void;
}

export function AdminModals({
  features,
  editingFeature,
  onCloseEdit,
  onEditSuccess,
  deletingFeature,
  isDeleting,
  onCloseDeletion,
  onConfirmDelete,
  linkingCriteriaFeature,
  onCloseLinkCriteria,
  onLinkCriteriaSuccess,
  pendingTransition,
  isTransitioning,
  onTransitionConfirm,
  onTransitionCancel,
  onReviewWithAI,
  onStartImplementation,
}: AdminModalsProps) {
  return (
    <>
      {/* Edit Modal */}
      {editingFeature && (
        <AdminFeatureEditForm
          feature={{
            id: editingFeature.id,
            feature_code: editingFeature.feature_code,
            title: editingFeature.title,
            description: editingFeature.description,
            feature_type: editingFeature.feature_type as 'functional_requirement' | 'journey',
            priority: editingFeature.priority as 'P1' | 'P2' | 'P3' | 'P4',
            status: editingFeature.status,
            category: editingFeature.category,
            spec_section: editingFeature.spec_section || '',
            acceptance_criteria: editingFeature.acceptance_criteria || [],
            test_cases: editingFeature.test_cases?.filter((tc): tc is typeof tc & { id: string } => !!tc.id).map(tc => ({
              id: tc.id,
              test_code: tc.test_code,
              title: tc.title,
              test_type: tc.test_type,
              priority: tc.priority,
              automated: tc.automated,
            })),
          }}
          onClose={onCloseEdit}
          onSuccess={onEditSuccess}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={onCloseDeletion} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete {deletingFeature.feature_code}</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to delete <strong>{deletingFeature.title}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently remove this {deletingFeature.feature_type === 'journey' ? 'journey' : 'feature'} and all associated comments and ratings.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onCloseDeletion}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirmDelete(deletingFeature)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Transition Confirmation Modal */}
      {pendingTransition && (() => {
        const transitionFeature = features.find((f) => f.id === pendingTransition.featureId);
        if (!transitionFeature) return null;
        return (
          <TransitionConfirmModal
            feature={transitionFeature}
            fromStatus={pendingTransition.fromStatus}
            toStatus={pendingTransition.toStatus}
            onConfirm={onTransitionConfirm}
            onCancel={onTransitionCancel}
            isUpdating={isTransitioning}
            onReviewWithAI={onReviewWithAI ? () => {
              onTransitionCancel();
              onReviewWithAI(transitionFeature);
            } : undefined}
            onStartImplementation={onStartImplementation ? () => {
              onTransitionCancel();
              onStartImplementation(transitionFeature);
            } : undefined}
          />
        );
      })()}

      {/* Criteria Feature Link Modal */}
      {linkingCriteriaFeature && linkingCriteriaFeature.feature_type === 'journey' && (
        <AdminCriteriaFeatureLink
          journey={{
            id: linkingCriteriaFeature.id,
            feature_code: linkingCriteriaFeature.feature_code,
            title: linkingCriteriaFeature.title,
            acceptance_criteria: linkingCriteriaFeature.acceptance_criteria || [],
            implementing_features: linkingCriteriaFeature.implementing_features,
          }}
          allFeatures={features.map((f) => ({
            id: f.id,
            feature_code: f.feature_code,
            title: f.title,
            status: f.status,
            feature_type: f.feature_type,
          }))}
          onClose={onCloseLinkCriteria}
          onSuccess={onLinkCriteriaSuccess}
        />
      )}
    </>
  );
}
