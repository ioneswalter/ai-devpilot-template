/**
 * VersionBumpModal — Modal for creating a new version of a released feature (FR-149)
 */

import { useState } from 'react';
import { productApi } from '@/lib/api/product-api';

interface VersionBumpModalProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  currentVersion: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function VersionBumpModal({
  featureId,
  featureCode,
  featureTitle,
  currentVersion,
  onClose,
  onSuccess,
}: VersionBumpModalProps) {
  const [bumpType, setBumpType] = useState<'minor' | 'major'>('minor');
  const [changeSummary, setChangeSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!changeSummary.trim()) {
      setError('A changelog entry is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await productApi.bumpVersion(featureId, bumpType, changeSummary.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayVersion = currentVersion ?? 'v1.0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">New Version</h2>
        <p className="text-sm text-gray-500 mb-4">
          {featureCode} — {featureTitle}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Version
          </label>
          <span className="text-sm text-gray-900 font-mono">{displayVersion} (released)</span>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bump Type
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setBumpType('minor')}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border-2 transition-colors ${
                bumpType === 'minor'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">Minor</div>
              <div className="text-xs text-gray-500 mt-0.5">Additive changes</div>
            </button>
            <button
              type="button"
              onClick={() => setBumpType('major')}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border-2 transition-colors ${
                bumpType === 'major'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">Major</div>
              <div className="text-xs text-gray-500 mt-0.5">Breaking changes</div>
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Changelog Entry <span className="text-red-500">*</span>
          </label>
          <textarea
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Describe what changed in this version..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !changeSummary.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Version'}
          </button>
        </div>
      </div>
    </div>
  );
}
