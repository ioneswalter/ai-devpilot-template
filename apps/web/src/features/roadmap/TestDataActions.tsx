/**
 * TestDataActions — Generate and clean up test data (FR-111)
 * Compact action bar shown in the test panel header area.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { testDataApi, type TestDataSet } from '@/lib/api/test-data-api';

interface TestDataActionsProps {
  featureId: string;
  featureCode: string;
}

export function TestDataActions({ featureId, featureCode }: TestDataActionsProps) {
  const qc = useQueryClient();
  const [showDatasets, setShowDatasets] = useState(false);

  const { data: datasetsRes, isLoading: datasetsLoading } = useQuery({
    queryKey: ['test-datasets', featureId],
    queryFn: () => testDataApi.list(featureId),
    staleTime: 30_000,
  });

  const datasets: TestDataSet[] = datasetsRes?.data ?? [];
  const activeCount = datasets.filter((d) => d.status === 'active').length;
  const hasData = activeCount > 0;

  const generateMut = useMutation({
    mutationFn: () => testDataApi.generate(featureId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-datasets', featureId] });
      setShowDatasets(true);
    },
  });

  const cleanupMut = useMutation({
    mutationFn: () => testDataApi.cleanup({ feature_id: featureId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-datasets', featureId] });
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {hasData ? (
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            title="Regenerate test data"
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg inline-flex items-center gap-1.5 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            {generateMut.isPending ? (
              <span className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            {generateMut.isPending ? 'Regenerating...' : `Test Data Ready (${activeCount})`}
          </button>
        ) : (
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending || datasetsLoading}
            className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {generateMut.isPending ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </span>
            ) : datasetsLoading ? 'Checking...' : 'Generate Test Data'}
          </button>
        )}

        {activeCount > 0 && (
          <button
            onClick={() => cleanupMut.mutate()}
            disabled={cleanupMut.isPending}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {cleanupMut.isPending ? 'Cleaning...' : `Clean Up (${activeCount})`}
          </button>
        )}

        <button
          onClick={() => setShowDatasets((s) => !s)}
          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          {showDatasets ? 'Hide' : 'Datasets'}
        </button>
      </div>

      {generateMut.isSuccess && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
          Generated {generateMut.data.data.records_created} records for {featureCode}
          {generateMut.data.data.errors.length > 0 && (
            <span className="text-amber-600"> ({generateMut.data.data.errors.length} errors)</span>
          )}
        </div>
      )}

      {generateMut.isError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {generateMut.error instanceof Error ? generateMut.error.message : 'Generation failed'}
        </div>
      )}

      {cleanupMut.isSuccess && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
          Cleaned {cleanupMut.data.data.datasets_cleaned} dataset(s)
        </div>
      )}

      {showDatasets && datasets.length > 0 && (
        <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
          {datasets.map((ds) => (
            <DatasetRow key={ds.id} dataset={ds} />
          ))}
        </div>
      )}

      {showDatasets && datasets.length === 0 && (
        <p className="text-xs text-gray-400 italic">No datasets generated yet</p>
      )}
    </div>
  );
}

function DatasetRow({ dataset }: { dataset: TestDataSet }) {
  const statusColors: Record<string, string> = {
    active: 'text-green-700 bg-green-50',
    partial: 'text-amber-700 bg-amber-50',
    cleaned: 'text-gray-500 bg-gray-50',
    failed: 'text-red-700 bg-red-50',
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded font-medium ${statusColors[dataset.status]}`}>
          {dataset.status}
        </span>
        <span className="text-gray-600">{dataset.records_created} records</span>
      </div>
      <time className="text-gray-400">
        {new Date(dataset.created_at).toLocaleDateString()}
      </time>
    </div>
  );
}
