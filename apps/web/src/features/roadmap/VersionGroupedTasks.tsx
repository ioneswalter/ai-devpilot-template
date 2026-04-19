/** VersionGroupedTasks - Groups implementation tasks by version label */
import type { ImplementationTaskItem } from '@/lib/api/admin-api';
import { ImplementationTaskCard } from './ImplementationTaskCard';
import { ComplexityScorePanel } from './ComplexityScorePanel';

interface VersionGroupedTasksProps {
  taskItems: ImplementationTaskItem[];
  versionInfo: { currentLabel: string; priorLabel: string } | null | undefined;
  onDecision: (id: string, data: { decision?: string; title?: string; description?: string }) => void;
  onComment: (id: string, comment: string) => void;
  isUpdating: boolean;
  isImplementing: boolean;
}

export function VersionGroupedTasks({
  taskItems, versionInfo, onDecision, onComment, isUpdating, isImplementing,
}: VersionGroupedTasksProps) {
  // Group tasks by version_label
  const groups = new Map<string, ImplementationTaskItem[]>();
  for (const item of taskItems) {
    const label = item.version_label ?? 'v1.0';
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }

  const sortedVersions = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  const hasMultipleVersions = sortedVersions.length > 1;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Implementation Tasks ({taskItems.length})
      </h4>

      {sortedVersions.map((version) => {
        const items = groups.get(version) ?? [];
        return (
          <div key={version} className="mb-4">
            {hasMultipleVersions && (
              <div className="flex items-center gap-2 mb-2 mt-3">
                <span className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded ${
                  version === versionInfo?.currentLabel
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {version}
                </span>
                <span className="text-xs text-gray-400">
                  {items.length} task{items.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={item.id} className="space-y-1">
                  <ImplementationTaskCard
                    item={item}
                    index={i}
                    onDecision={(id, data) => onDecision(id, data)}
                    onComment={(id, comment) => onComment(id, comment)}
                    isUpdating={isUpdating}
                    isImplementing={isImplementing}
                  />
                  {item.complexity_score && (
                    <ComplexityScorePanel
                      score={item.complexity_score}
                      taskItems={taskItems}
                      parentTaskId={item.id}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
