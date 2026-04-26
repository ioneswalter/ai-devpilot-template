/**
 * Hook for managing ideation chat state (FR-103 J1 migration).
 * Uses TanStack Query for messages (cache-aware) and a mutation for send
 * with optimistic updates + rollback.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { devpilotApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { ConversationMessage, MessageMetadata } from '../types';

/** Approximate cost per message (1K input + 2K output tokens) by model tier */
const MODEL_INFO: Record<string, { label: string; costPerMsg: string }> = {
  opus:   { label: 'Opus',   costPerMsg: '~$0.17' },
  sonnet: { label: 'Sonnet', costPerMsg: '~$0.03' },
  haiku:  { label: 'Haiku',  costPerMsg: '~$0.005' },
};

function getModelInfo(modelId: string): { label: string; costPerMsg: string } {
  for (const [key, info] of Object.entries(MODEL_INFO)) {
    if (modelId.includes(key)) return info;
  }
  return { label: modelId, costPerMsg: '' };
}

interface UseIdeationChatOptions {
  conversationId: string | null;
}

function mapApiMessages(raw: ReadonlyArray<{ id: string; role: string; content: string; metadata: unknown; created_at: string }>): ConversationMessage[] {
  return raw.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    metadata: (m.metadata as unknown as MessageMetadata) ?? null,
    created_at: m.created_at,
  }));
}

export function useIdeationChat({ conversationId }: UseIdeationChatOptions) {
  const queryClient = useQueryClient();
  // Allow lazy creation: first message creates a conversation, then subsequent messages reuse the id
  const [overrideConvId, setOverrideConvId] = useState<string | null>(null);
  const effectiveConvId = overrideConvId ?? conversationId;

  const isRealConv = !!effectiveConvId && effectiveConvId !== 'pending';
  const messagesQuery = useQuery({
    queryKey: isRealConv ? queryKeys.ideation.chat(effectiveConvId!) : queryKeys.ideation.all(),
    queryFn: async () => {
      if (!isRealConv) return [] as ConversationMessage[];
      const response = await devpilotApi.getConversation(effectiveConvId!);
      return mapApiMessages(response.data.messages ?? []);
    },
    enabled: isRealConv,
  });

  const messages = messagesQuery.data ?? [];
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (messagesQuery.error) {
      console.error('Failed to load messages:', messagesQuery.error);
      setError('Failed to load conversation');
    }
  }, [messagesQuery.error]);

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [modelCostPerMsg, setModelCostPerMsg] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; label: string; costPerMsg: string }>>([]);

  // Fetch available models on mount
  useEffect(() => {
    devpilotApi.getChatModel()
      .then((res) => {
        const defaultInfo = getModelInfo(res.data.model);
        setSelectedModelId(res.data.model);
        setModelLabel(defaultInfo.label);
        setModelCostPerMsg(defaultInfo.costPerMsg);
        if (res.data.available_models) {
          setAvailableModels(res.data.available_models.map(m => ({
            ...m, costPerMsg: getModelInfo(m.id).costPerMsg,
          })));
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  // Compatibility shim — consumers can still call loadMessages(convId).
  // It now just invalidates the cache so the query refetches.
  const loadMessages = useCallback(async (convId: string) => {
    if (convId !== effectiveConvId) {
      setOverrideConvId(convId);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.ideation.chat(convId) });
  }, [effectiveConvId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async ({ convId, message }: { convId: string; message: string }) => {
      const response = await devpilotApi.sendMessage(convId, message, selectedModelId ?? undefined);
      return response.data;
    },
    onMutate: async ({ convId, message }) => {
      const queryKey = queryKeys.ideation.chat(convId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ConversationMessage[]>(queryKey) ?? [];
      const tempUserMsg: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ConversationMessage[]>(queryKey, [...previous, tempUserMsg]);
      return { previous, tempUserMsg, queryKey };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.queryKey) queryClient.setQueryData(ctx.queryKey, ctx.previous);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    },
    onSuccess: (data, vars, ctx) => {
      const { user_message, assistant_message, model, cost } = data;
      if (model) {
        const info = getModelInfo(model);
        setModelLabel(info.label);
        setModelCostPerMsg(info.costPerMsg);
      }
      const queryKey = queryKeys.ideation.chat(vars.convId);
      queryClient.setQueryData<ConversationMessage[]>(queryKey, (prev) => {
        const filtered = (prev ?? []).filter((m) => m.id !== ctx?.tempUserMsg.id);
        return [
          ...filtered,
          {
            id: user_message.id,
            role: user_message.role as 'user',
            content: user_message.content,
            metadata: null,
            created_at: user_message.created_at,
          },
          {
            id: assistant_message.id,
            role: assistant_message.role as 'assistant',
            content: assistant_message.content,
            metadata: {
              ...((assistant_message.metadata as unknown as MessageMetadata) ?? {} as MessageMetadata),
              ...(cost != null ? { cost } : {}),
              ...(model ? { model } : {}),
            } as MessageMetadata,
            created_at: assistant_message.created_at,
          },
        ];
      });
    },
  });

  const sendMessage = useCallback(
    async (message: string, lazyConversationId?: string) => {
      const convId = lazyConversationId ?? effectiveConvId;
      if (!convId || sendMutation.isPending) return;

      // Track override for lazy creation
      if (lazyConversationId && !conversationId) {
        setOverrideConvId(lazyConversationId);
      }
      setError(null);
      sendMutation.mutate({ convId, message });
    },
    [effectiveConvId, conversationId, sendMutation],
  );

  // Extract latest proposals from messages
  const latestProposals = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i].metadata;
      if (meta && meta.type === 'proposal') {
        if (meta.proposals && Array.isArray(meta.proposals)) return meta.proposals;
        if (meta.proposal) return [meta.proposal];
      }
    }
    return null;
  })();
  const latestProposal = latestProposals?.[0] ?? null;

  const selectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    const info = getModelInfo(modelId);
    setModelLabel(info.label);
    setModelCostPerMsg(info.costPerMsg);
  }, []);

  const clearMessages = useCallback(() => {
    setOverrideConvId(null);
  }, []);

  return {
    messages,
    isLoading: sendMutation.isPending,
    error,
    sendMessage,
    loadMessages,
    clearMessages,
    latestProposal,
    latestProposals,
    modelLabel,
    modelCostPerMsg,
    availableModels,
    selectedModelId,
    selectModel,
  };
}
