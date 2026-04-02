/**
 * SpecArtifactsView — Displays spec artifacts (spec.md, plan.md, tasks.md, etc.)
 * for a feature inside the Spec Review modal.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi, type SpecArtifact } from '@/lib/api/admin-api';
import { MarkdownRenderer } from './MarkdownRenderer';

interface SpecArtifactsViewProps {
  featureId: string;
  onArtifactsLoaded?: (count: number) => void;
  defaultCollapsed?: boolean;
}

const ARTIFACT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  spec: { label: 'Specification', icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  research: { label: 'Research', icon: '🔍', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  data_model: { label: 'Data Model', icon: '🗄️', color: 'bg-green-50 border-green-200 text-green-700' },
  api_contract: { label: 'API Contract', icon: '🔗', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  quickstart: { label: 'Quickstart', icon: '🚀', color: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  plan: { label: 'Implementation Plan', icon: '📐', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  tasks: { label: 'Tasks', icon: '✅', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
};

const DISPLAY_ORDER = ['spec', 'research', 'data_model', 'api_contract', 'quickstart', 'plan', 'tasks'];

export function SpecArtifactsView({ featureId, onArtifactsLoaded, defaultCollapsed = false }: SpecArtifactsViewProps) {
  const [artifacts, setArtifacts] = useState<SpecArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback((artId: string) => {
    setExpandedArtifact(prev => {
      const next = prev === artId ? null : artId;
      if (next) {
        requestAnimationFrame(() => {
          expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi.getSpecArtifacts(featureId)
      .then((res) => {
        if (!cancelled) {
          setArtifacts(res.data.artifacts);
          onArtifactsLoaded?.(res.data.artifacts.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArtifacts([]);
          onArtifactsLoaded?.(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [featureId]);

  if (loading) return null;
  if (artifacts.length === 0) return null;

  const sorted = [...artifacts].sort((a, b) => {
    const ai = DISPLAY_ORDER.indexOf(a.artifact_type);
    const bi = DISPLAY_ORDER.indexOf(b.artifact_type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="border-b">
      <div className="px-4 py-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-2 mb-2 group"
        >
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Spec Artifacts ({artifacts.length})
          </h4>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform group-hover:text-gray-600 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className={`space-y-1.5 ${collapsed ? 'hidden' : ''}`}>
          {/* When an artifact is expanded, show compact pills for the others */}
          {expandedArtifact && (
            <div className="flex flex-wrap gap-1 mb-2">
              {sorted.filter(a => a.id !== expandedArtifact).map((art) => {
                const meta = ARTIFACT_LABELS[art.artifact_type] ?? {
                  label: art.artifact_type, icon: '📄', color: 'bg-gray-50 border-gray-200 text-gray-700',
                };
                return (
                  <button
                    key={art.id}
                    onClick={() => handleToggle(art.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border hover:bg-gray-50 transition-colors ${meta.color}`}
                  >
                    <span className="text-xs">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}
          {sorted.map((art) => {
            const meta = ARTIFACT_LABELS[art.artifact_type] ?? {
              label: art.artifact_type, icon: '📄', color: 'bg-gray-50 border-gray-200 text-gray-700',
            };
            const isExpanded = expandedArtifact === art.id;
            // Hide non-expanded rows when one is open
            if (expandedArtifact && !isExpanded) return null;
            return (
              <div key={art.id} ref={isExpanded ? expandedRef : undefined} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => handleToggle(art.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                    isExpanded ? 'bg-gray-50' : ''
                  }`}
                >
                  <span className="text-sm">{meta.icon}</span>
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded border ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{art.file_name}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="border-t bg-white px-4 py-3 max-h-[70vh] overflow-y-auto">
                    <MarkdownRenderer content={art.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
