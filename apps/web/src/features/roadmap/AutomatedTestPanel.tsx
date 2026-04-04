/**
 * AutomatedTestPanel — UI for AI test script generation and execution (FR-109 J1)
 * Shows automation status per test case, generate/run controls, script step viewer.
 */

import { useState, useEffect } from 'react';
import { useAutomatedTests } from './useAutomatedTests';
import { VisualCheckpointViewer } from './VisualCheckpointViewer';
import type { ScriptListItem } from './automation-types';

interface AutomatedTestPanelProps {
  featureId: string;
  testCaseCount: number;
}

interface CheckpointData {
  step_number: number;
  passed: boolean;
  cosmetic_only: boolean;
  explanation: string;
}

export function AutomatedTestPanel({ featureId, testCaseCount }: AutomatedTestPanelProps) {
  const auto = useAutomatedTests(featureId);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [lastCheckpoints, setLastCheckpoints] = useState<Record<string, CheckpointData[]>>({});

  useEffect(() => { auto.loadScripts(); }, [auto.loadScripts]);

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="w-full text-left px-3 py-2 text-xs bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-medium text-indigo-700">
          AI Test Automation
          {auto.scripts.length > 0 && (
            <span className="ml-1 text-indigo-500">
              ({auto.scripts.length}/{testCaseCount} automated)
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden">
      <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-indigo-800">AI Test Automation</h4>
        <div className="flex gap-2">
          <GenerateButton
            generating={auto.generating}
            onGenerate={() => auto.generateScripts()}
          />
          <button
            onClick={() => setShowPanel(false)}
            className="text-xs text-indigo-500 hover:text-indigo-700"
          >
            Collapse
          </button>
        </div>
      </div>

      {auto.error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          {auto.error}
        </div>
      )}

      {auto.lastGeneration && (
        <GenerationSummary
          generated={auto.lastGeneration.total_generated}
          skipped={auto.lastGeneration.total_skipped}
        />
      )}

      <div className="divide-y">
        {auto.scripts.length === 0 && !auto.generating && (
          <div className="px-3 py-4 text-center text-xs text-gray-500">
            No automated scripts yet. Click "Generate" to create them from acceptance criteria.
          </div>
        )}
        {auto.scripts.map((script) => (
          <ScriptRow
            key={script.id}
            script={script}
            expanded={expandedScript === script.id}
            onToggle={() => setExpandedScript(
              expandedScript === script.id ? null : script.id,
            )}
            onRun={async () => {
              const result = await auto.executeScript(script.id, 'development');
              if (result?.visual_checkpoints) {
                setLastCheckpoints((prev) => ({ ...prev, [script.id]: result.visual_checkpoints }));
              }
            }}
            onDelete={() => auto.deleteScript(script.id)}
            executing={auto.executing}
            checkpoints={lastCheckpoints[script.id]}
          />
        ))}
      </div>

      {auto.scripts.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {auto.scripts.filter((s) => !s.is_stale).length} active,{' '}
            {auto.scripts.filter((s) => s.is_stale).length} stale
          </span>
          <button
            onClick={() => auto.executeSuite('development')}
            disabled={auto.executing}
            className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {auto.executing ? 'Running...' : 'Run All'}
          </button>
        </div>
      )}
    </div>
  );
}

function GenerateButton({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <button
      onClick={onGenerate}
      disabled={generating}
      className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
    >
      {generating ? (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Generating...
        </span>
      ) : 'Generate'}
    </button>
  );
}

function GenerationSummary({
  generated,
  skipped,
}: {
  generated: number;
  skipped: number;
}) {
  return (
    <div className="px-3 py-2 bg-green-50 border-b border-green-100 text-xs text-green-700">
      Generated {generated} script{generated !== 1 ? 's' : ''}.
      {skipped > 0 && ` ${skipped} test${skipped !== 1 ? 's' : ''} skipped (not automatable).`}
    </div>
  );
}

function ScriptRow({
  script,
  expanded,
  onToggle,
  onRun,
  onDelete,
  executing,
  checkpoints,
}: {
  script: ScriptListItem;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  executing: boolean;
  checkpoints?: CheckpointData[];
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="flex-1 text-left flex items-center gap-2">
          <StatusBadge result={script.last_run_result} stale={script.is_stale} />
          <span className="text-xs font-medium text-gray-800 truncate">
            {script.test_case_title}
          </span>
          <span className="text-xs text-gray-400">{script.step_count} steps</span>
        </button>
        <div className="flex gap-1">
          <button
            onClick={onRun}
            disabled={executing || script.is_stale}
            className="px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
          >
            Run
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded"
          >
            Delete
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          <ScriptStepsViewer steps={script.step_count} scriptId={script.id} />
          {checkpoints && checkpoints.length > 0 && (
            <VisualCheckpointViewer checkpoints={checkpoints} />
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ result, stale }: { result: string | null; stale: boolean }) {
  if (stale) {
    return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Stale" />;
  }
  if (result === 'passed') {
    return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Passed" />;
  }
  if (result === 'failed' || result === 'error') {
    return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Failed" />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" title="Not run" />;
}

function ScriptStepsViewer({ steps: _stepCount, scriptId: _scriptId }: { steps: number; scriptId: string }) {
  // In a full implementation, this would fetch and display the actual script steps.
  // For now, show a placeholder that indicates the script is viewable.
  return (
    <div className="mt-2 pl-4 border-l-2 border-indigo-100">
      <p className="text-xs text-gray-500 italic">
        Script with {_stepCount} steps using semantic element references.
      </p>
    </div>
  );
}
