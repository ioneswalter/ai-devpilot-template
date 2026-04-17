/**
 * PipelineModals - Spec, Build, Test, and Release modal panels for the roadmap.
 */

import { Modal } from '../../components/ui/Modal';
import { SpecReviewPanel } from './SpecReviewPanel';
import { ImplementationPanel } from './ImplementationPanel';
import { TestRunPanel } from './TestRunPanel';
import { ReleasePanel } from './ReleasePanel';
import { apiClient } from '../../lib/supabase-client';
import type { ProductFeature } from './roadmap-helpers';

interface PipelineModalsProps {
  reviewingFeature: ProductFeature | null;
  setReviewingFeature: (f: ProductFeature | null) => void;
  implementingFeature: ProductFeature | null;
  setImplementingFeature: (f: ProductFeature | null) => void;
  testingFeature: ProductFeature | null;
  setTestingFeature: (f: ProductFeature | null) => void;
  showReleases: boolean;
  setShowReleases: (v: boolean) => void;
  onFetchFeatures: () => void;
  onPipelineInvalidate: () => void;
}

export function PipelineModals({
  reviewingFeature,
  setReviewingFeature,
  implementingFeature,
  setImplementingFeature,
  testingFeature,
  setTestingFeature,
  showReleases,
  setShowReleases,
  onFetchFeatures,
  onPipelineInvalidate,
}: PipelineModalsProps) {
  return (
    <>
      {/* Spec Review Modal */}
      <Modal
        isOpen={!!reviewingFeature}
        onClose={() => { setReviewingFeature(null); onPipelineInvalidate(); }}
        size="xl"
        showCloseButton={false}
        flush
        className="h-[92vh]"
      >
        {reviewingFeature && (
          <SpecReviewPanel
            featureId={reviewingFeature.id}
            featureCode={reviewingFeature.feature_code}
            featureTitle={reviewingFeature.title}
            featureStatus={reviewingFeature.status}
            onClose={() => { setReviewingFeature(null); onPipelineInvalidate(); }}
            onReviewComplete={() => {
              setReviewingFeature(null);
              onFetchFeatures();
              onPipelineInvalidate();
            }}
          />
        )}
      </Modal>

      {/* Implementation Modal */}
      <Modal
        isOpen={!!implementingFeature}
        onClose={() => { setImplementingFeature(null); onPipelineInvalidate(); }}
        size="xl"
        showCloseButton={false}
        flush
        className="h-[92vh]"
      >
        {implementingFeature && (
          <ImplementationPanel
            key={implementingFeature.id}
            featureId={implementingFeature.id}
            featureCode={implementingFeature.feature_code}
            featureTitle={implementingFeature.title}
            featureStatus={implementingFeature.status}
            onClose={() => { setImplementingFeature(null); onPipelineInvalidate(); }}
            onComplete={() => {
              setImplementingFeature(null);
              onFetchFeatures();
              onPipelineInvalidate();
            }}
          />
        )}
      </Modal>

      {/* Test Run Modal */}
      <Modal
        isOpen={!!testingFeature}
        onClose={() => setTestingFeature(null)}
        size="xl"
        showCloseButton={false}
        flush
        className="h-[92vh]"
      >
        {testingFeature && (
          <TestRunPanel
            key={testingFeature.id}
            featureId={testingFeature.id}
            featureCode={testingFeature.feature_code}
            featureTitle={testingFeature.title}
            featureStatus={testingFeature.status}
            testCases={testingFeature.test_cases ?? []}
            onClose={() => { setTestingFeature(null); onPipelineInvalidate(); }}
            onComplete={async () => {
              await apiClient('roadmap-admin-features', {
                method: 'PATCH',
                body: JSON.stringify({ feature_id: testingFeature.id, status: 'released' }),
              });
              setTestingFeature(null);
              onFetchFeatures();
              onPipelineInvalidate();
            }}
            onRefresh={() => { onFetchFeatures(); onPipelineInvalidate(); }}
          />
        )}
      </Modal>

      <ReleasePanel isOpen={showReleases} onClose={() => setShowReleases(false)} />
    </>
  );
}
