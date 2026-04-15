/**
 * usePrototype — manages prototype state from chat message metadata.
 * Extracts prototype info from messages, tracks current version,
 * and handles disambiguation + error states.
 * FR-140: AI Prototype Builder
 */

import { useState, useCallback, useMemo } from 'react';
import { devpilotApi } from '../../../lib/api/devpilot-api';
import type { ConversationMessage } from '../types';
import type { PrototypeType } from '@ownyourgig/types';

/** Version info returned by the prototype-versions API (subset of full PrototypeVersion) */
interface VersionInfo {
  id: string;
  version_number: number;
  prototype_type: string;
  content: string;
  feedback_prompt: string | null;
  is_current: boolean;
  confidence: number | null;
  created_at: string;
}

interface PrototypeState {
  content: string | null;
  prototypeType: PrototypeType | null;
  isGenerating: boolean;
  error: { code: string; message: string } | null;
  disambiguation: { detected_types: PrototypeType[]; confidence: number } | null;
  versionNumber: number;
  totalVersions: number;
  versions: VersionInfo[];
}

export function usePrototype(conversationId: string | null) {
  const [state, setState] = useState<PrototypeState>({
    content: null,
    prototypeType: null,
    isGenerating: false,
    error: null,
    disambiguation: null,
    versionNumber: 0,
    totalVersions: 0,
    versions: [],
  });

  const setGenerating = useCallback((val: boolean) => {
    setState((s) => ({ ...s, isGenerating: val, error: null }));
  }, []);

  /** Process metadata from a chat message to update prototype state */
  const processMessage = useCallback((msg: ConversationMessage) => {
    const meta = msg.metadata as Record<string, unknown> | null;
    if (!meta?.type) return;

    if (meta.type === 'prototype_generated') {
      setState((s) => ({
        ...s,
        content: null, // Will be loaded via fetchVersions
        prototypeType: meta.prototype_type as PrototypeType,
        isGenerating: false,
        error: null,
        disambiguation: null,
        versionNumber: meta.version_number as number,
        totalVersions: Math.max(s.totalVersions, meta.version_number as number),
      }));
      // Fetch the actual content
      if (conversationId) {
        fetchVersions(conversationId);
      }
    }

    if (meta.type === 'prototype_disambiguation') {
      setState((s) => ({
        ...s,
        isGenerating: false,
        disambiguation: {
          detected_types: meta.detected_types as PrototypeType[],
          confidence: meta.confidence as number,
        },
      }));
    }

    if (meta.type === 'prototype_error') {
      setState((s) => ({
        ...s,
        isGenerating: false,
        error: {
          code: meta.error_code as string,
          message: meta.message as string,
        },
      }));
    }
  }, [conversationId]);

  /** Fetch all versions for the conversation */
  const fetchVersions = useCallback(async (convId: string) => {
    try {
      const result = await devpilotApi.getPrototypeVersions(convId);
      const data = result?.data;
      if (!data?.versions?.length) return;

      const current = data.versions.find(
        (v: VersionInfo) => v.is_current,
      );
      setState((s) => ({
        ...s,
        versions: data.versions,
        content: current?.content ?? null,
        prototypeType: (current?.prototype_type as PrototypeType) ?? s.prototypeType,
        versionNumber: data.current_version,
        totalVersions: data.total_versions,
      }));
    } catch {
      // Silently fail — prototype preview is optional
    }
  }, []);

  /** Clear disambiguation and error states */
  const clearDisambiguation = useCallback(() => {
    setState((s) => ({ ...s, disambiguation: null }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  /** Revert to a specific version */
  const [isReverting, setIsReverting] = useState(false);
  const revertToVersion = useCallback(async (versionId: string) => {
    if (!conversationId) return;
    setIsReverting(true);
    try {
      const result = await devpilotApi.revertPrototypeVersion(conversationId, versionId);
      if (result?.data?.reverted_to) {
        const reverted = result.data.reverted_to;
        setState((s) => ({
          ...s,
          content: reverted.content,
          prototypeType: reverted.prototype_type as PrototypeType,
          versionNumber: result.data.new_current_version,
          versions: s.versions.map((v) => ({
            ...v,
            is_current: v.id === versionId,
          })),
        }));
      }
    } catch {
      // Silently fail
    } finally {
      setIsReverting(false);
    }
  }, [conversationId]);

  /** Finalise the current prototype (locks it for proposal attachment) */
  const [isFinalised, setIsFinalised] = useState(false);
  const finalise = useCallback(() => setIsFinalised(true), []);

  /** Check if any message has prototype metadata */
  const hasPrototype = useMemo(() => {
    return state.content !== null || state.totalVersions > 0;
  }, [state.content, state.totalVersions]);

  return {
    ...state,
    hasPrototype,
    isFinalised,
    isReverting,
    setGenerating,
    processMessage,
    fetchVersions,
    revertToVersion,
    finalise,
    clearDisambiguation,
    clearError,
  };
}
