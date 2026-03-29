/**
 * CreateReleaseForm - Form for creating a new release
 * Collects name, version, description, feature selection, and schedule
 */

import { useState, useCallback } from 'react'
import { useCreateRelease } from './useReleases'
import { FeatureSelector } from './FeatureSelector'
import { generateVersionSuggestions } from './version-utils'

const ArrowLeftIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
)
const LoaderIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
)

interface CreateReleaseFormProps {
  onBack: () => void
  onReleaseCreated: (id: string) => void
  existingVersions?: string[]
}

export function CreateReleaseForm({
  onBack,
  onReleaseCreated,
  existingVersions = [],
}: CreateReleaseFormProps) {
  const suggestions = generateVersionSuggestions(existingVersions)

  const [name, setName] = useState('')
  const [version, setVersion] = useState(suggestions.minor)
  const [description, setDescription] = useState('')
  const [featureIds, setFeatureIds] = useState<string[]>([])
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showFeatureSelector, setShowFeatureSelector] = useState(false)

  const createMutation = useCreateRelease()

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Release name is required')
      return
    }
    if (!version.trim()) {
      setError('Version is required')
      return
    }
    if (featureIds.length === 0) {
      setError('Select at least one feature')
      return
    }

    try {
      const result = await createMutation.mutateAsync({
        title: name.trim(),
        version: version.trim(),
        description: description.trim() || undefined,
        feature_ids: featureIds,
        scheduled_for: scheduledFor || undefined,
      })
      const releaseId = (result as { id?: string })?.id ?? ''
      onReleaseCreated(releaseId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create release')
    }
  }, [name, version, description, featureIds, scheduledFor, createMutation, onReleaseCreated])

  return (
    <div className="p-6 overflow-y-auto max-h-[70vh]">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to releases
      </button>

      <h3 className="text-lg font-semibold text-gray-900 mb-6">Create New Release</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Release Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint 12 Release"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Version */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
            <div className="flex gap-1">
              {Object.entries(suggestions).map(([type, ver]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setVersion(ver)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    version === ver
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {type} ({ver})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this release..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled For (optional)</label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Feature Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Features ({featureIds.length} selected)
            </label>
            <button
              type="button"
              onClick={() => setShowFeatureSelector(!showFeatureSelector)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showFeatureSelector ? 'Hide selector' : 'Select features'}
            </button>
          </div>

          {featureIds.length === 0 && !showFeatureSelector && (
            <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-500 mb-2">No features selected yet</p>
              <button
                type="button"
                onClick={() => setShowFeatureSelector(true)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Select features to include
              </button>
            </div>
          )}

          {showFeatureSelector && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <FeatureSelector
                features={[]}
                selectedFeatureIds={featureIds}
                onSelectionChange={setFeatureIds}
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {createMutation.isPending && <LoaderIcon className="w-4 h-4 animate-spin" />}
            {createMutation.isPending ? 'Creating...' : 'Create Release'}
          </button>
        </div>
      </form>
    </div>
  )
}
