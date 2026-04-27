/**
 * PipelineModals - Spec, Build, Test, UAT, Release, and Fix-Cycle modal panels
 * for the roadmap. Each modal is a small wrapper to keep this orchestrator
 * function within constitution limits.
 */

import { Modal } from '../../components/ui/Modal';
import { SpecReviewPanel } from './SpecReviewPanel';
import { ImplementationPanel } from './ImplementationPanel';
import { TestRunPanel } from './TestRunPanel';
import { ReleasePanel } from './ReleasePanel';
import { UATReviewPanel } from './UATReviewPanel';
import { FixCycleTaskList } from '@/features/uat/FixCycleTaskList';
import { apiClient } from '../../lib/supabase-client';
import type { ProductFeature } from './roadmap-helpers';

interface PipelineModalsProps {
  reviewingFeature: ProductFeature | null;
  setReviewingFeature: (f: ProductFeature | null) => void;
  implementingFeature: ProductFeature | null;
  setImplementingFeature: (f: ProductFeature | null) => void;
  testingFeature: ProductFeature | null;
  setTestingFeature: (f: ProductFeature | null) => void;
  uatFeature: ProductFeature | null;
  setUatFeature: (f: ProductFeature | null) => void;
  showReleases: boolean;
  setShowReleases: (v: boolean) => void;
  showFixTasks: boolean;
  setShowFixTasks: (v: boolean) => void;
  onFetchFeatures: () => void;
  onPipelineInvalidate: () => void;
}

const MODAL_SIZE_PROPS = { size: 'xl' as const, showCloseButton: false, flush: true, className: 'h-[92vh]' };

export function PipelineModals(props: PipelineModalsProps) {
  return (
    <>
      <SpecReviewModal {...props} />
      <ImplementationModal {...props} />
      <TestRunModal {...props} />
      <UATReviewModal {...props} />
      <ReleasePanel isOpen={props.showReleases} onClose={() => props.setShowReleases(false)} />
      <FixCycleTasksModal showFixTasks={props.showFixTasks} setShowFixTasks={props.setShowFixTasks} />
    </>
  );
}

function SpecReviewModal({ reviewingFeature, setReviewingFeature, onFetchFeatures, onPipelineInvalidate }: PipelineModalsProps) {
  const close = () => { setReviewingFeature(null); onPipelineInvalidate(); };
  return (
    <Modal isOpen={!!reviewingFeature} onClose={close} {...MODAL_SIZE_PROPS}>
      {reviewingFeature && (
        <SpecReviewPanel
          featureId={reviewingFeature.id}
          featureCode={reviewingFeature.feature_code}
          featureTitle={reviewingFeature.title}
          featureStatus={reviewingFeature.status}
          onClose={close}
          onReviewComplete={() => { setReviewingFeature(null); onFetchFeatures(); onPipelineInvalidate(); }}
        />
      )}
    </Modal>
  );
}

function ImplementationModal({ implementingFeature, setImplementingFeature, onFetchFeatures, onPipelineInvalidate }: PipelineModalsProps) {
  const close = () => { setImplementingFeature(null); onPipelineInvalidate(); };
  return (
    <Modal isOpen={!!implementingFeature} onClose={close} {...MODAL_SIZE_PROPS}>
      {implementingFeature && (
        <ImplementationPanel
          key={implementingFeature.id}
          featureId={implementingFeature.id}
          featureCode={implementingFeature.feature_code}
          featureTitle={implementingFeature.title}
          featureStatus={implementingFeature.status}
          onClose={close}
          onComplete={() => { setImplementingFeature(null); onFetchFeatures(); onPipelineInvalidate(); }}
        />
      )}
    </Modal>
  );
}

function TestRunModal({ testingFeature, setTestingFeature, onFetchFeatures, onPipelineInvalidate }: PipelineModalsProps) {
  const close = () => { setTestingFeature(null); onPipelineInvalidate(); };
  return (
    <Modal isOpen={!!testingFeature} onClose={() => setTestingFeature(null)} {...MODAL_SIZE_PROPS}>
      {testingFeature && (
        <TestRunPanel
          key={testingFeature.id}
          featureId={testingFeature.id}
          featureCode={testingFeature.feature_code}
          featureTitle={testingFeature.title}
          featureStatus={testingFeature.status}
          testCases={testingFeature.test_cases ?? []}
          onClose={close}
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
  );
}

function UATReviewModal({ uatFeature, setUatFeature, onPipelineInvalidate }: PipelineModalsProps) {
  const close = () => { setUatFeature(null); onPipelineInvalidate(); };
  return (
    <Modal isOpen={!!uatFeature} onClose={close} {...MODAL_SIZE_PROPS}>
      {uatFeature && (
        <UATReviewPanel
          featureId={uatFeature.id}
          featureCode={uatFeature.feature_code}
          featureTitle={uatFeature.title}
          featureStatus={uatFeature.status}
          onClose={close}
        />
      )}
    </Modal>
  );
}

function FixCycleTasksModal({ showFixTasks, setShowFixTasks }: { showFixTasks: boolean; setShowFixTasks: (v: boolean) => void }) {
  return (
    <Modal isOpen={showFixTasks} onClose={() => setShowFixTasks(false)} {...MODAL_SIZE_PROPS}>
      {showFixTasks && <FixCycleTaskList onClose={() => setShowFixTasks(false)} />}
    </Modal>
  );
}
