/**
 * Component to display features in a release with add/remove functionality
 * Shows feature code, title, status badge, and management buttons for draft releases
 */

import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

const TrashIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
);
const PlusIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

interface Feature {
  id: string;
  feature_code: string;
  title: string;
  status: 'draft' | 'in_progress' | 'testing' | 'released' | 'deployed';
}

interface Release {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'scheduled' | 'deployed' | 'rolled_back';
  features: Feature[];
}

interface ReleaseFeatureListProps {
  release: Release;
  availableFeatures?: Feature[];
  onAddFeature?: (featureId: string) => void;
  onRemoveFeature?: (featureId: string) => void;
  onSelectFeatures?: () => void;
}

const getStatusColor = (status: Feature['status']) => {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'testing':
      return 'bg-yellow-100 text-yellow-800';
    case 'released':
      return 'bg-green-100 text-green-800';
    case 'deployed':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function ReleaseFeatureList({
  release,
  availableFeatures = [],
  onRemoveFeature,
  onSelectFeatures
}: ReleaseFeatureListProps) {
  const isDraft = release.status === 'draft';
  const hasFeatures = release.features && release.features.length > 0;
  const hasAvailableFeatures = availableFeatures.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Features ({release.features?.length || 0})
          </CardTitle>
          {isDraft && (
            <div className="flex gap-2">
              {onSelectFeatures && hasAvailableFeatures && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectFeatures}
                  className="flex items-center gap-1"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Features
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasFeatures ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">No features added to this release yet.</p>
            {isDraft && onSelectFeatures && hasAvailableFeatures && (
              <Button
                variant="outline"
                onClick={onSelectFeatures}
                className="flex items-center gap-1 mx-auto"
              >
                <PlusIcon className="h-4 w-4" />
                Add Features
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {release.features.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-blue-600 font-medium">
                      {feature.feature_code}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(feature.status)}`}
                    >
                      {feature.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 line-clamp-1">
                    {feature.title}
                  </h4>
                </div>
                {isDraft && onRemoveFeature && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveFeature(feature.id)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 ml-3"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {hasFeatures && isDraft && availableFeatures.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">
              {availableFeatures.length} additional features available to add
            </p>
            {onSelectFeatures && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSelectFeatures}
                className="flex items-center gap-1"
              >
                <PlusIcon className="h-4 w-4" />
                Add More Features
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
