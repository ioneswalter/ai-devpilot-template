/**
 * Hook for managing ideation chat state
 * Handles messages, loading, sending, and proposal extraction
 */

import { useState, useCallback, useEffect } from 'react';
import { devpilotApi } from '@/lib/api-client';
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
  onMessagesLoaded?: (messages: ConversationMessage[]) => void;
}

export function useIdeationChat({ conversationId }: UseIdeationChatOptions) {
  // Allow overriding conversationId for lazy creation (first message creates conversation)
  const [overrideConvId, setOverrideConvId] = useState<string | null>(null);
  const effectiveConvId = overrideConvId ?? conversationId;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const response = await devpilotApi.getConversation(convId);
      const loaded = (response.data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        metadata: (m.metadata as unknown as MessageMetadata) ?? null,
        created_at: m.created_at,
      }));
      setMessages(loaded);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load conversation');
    }
  }, []);

  const sendMessage = useCallback(
    async (message: string, lazyConversationId?: string) => {
      const convId = lazyConversationId ?? effectiveConvId;
      if (!convId || isLoading) return;

      // Track override for lazy creation so subsequent messages use the same conversation
      if (lazyConversationId && !conversationId) {
        setOverrideConvId(lazyConversationId);
      }

      setIsLoading(true);
      setError(null);

      // Optimistic: add user message
      const tempUserMsg: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const response = await devpilotApi.sendMessage(convId, message, selectedModelId ?? undefined);
        const { user_message, assistant_message, model } = response.data;
        if (model) {
          const info = getModelInfo(model);
          setModelLabel(info.label);
          setModelCostPerMsg(info.costPerMsg);
        }

        setMessages((prev) => {
          // Replace temp user message with real one, add assistant message
          const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
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
              metadata: (assistant_message.metadata as unknown as MessageMetadata) ?? null,
              created_at: assistant_message.created_at,
            },
          ];
        });
      } catch (err) {
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveConvId, conversationId, isLoading, selectedModelId]
  );

  // Extract latest proposals from messages (supports both single and multi-proposal format)
  const latestProposals = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i].metadata;
      if (meta && meta.type === 'proposal') {
        // New format: proposals array
        if (meta.proposals && Array.isArray(meta.proposals)) {
          return meta.proposals;
        }
        // Legacy format: single proposal
        if (meta.proposal) {
          return [meta.proposal];
        }
      }
    }
    return null;
  })();

  // Backwards-compatible: latestProposal returns first proposal
  const latestProposal = latestProposals?.[0] ?? null;

  const selectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    const info = getModelInfo(modelId);
    setModelLabel(info.label);
    setModelCostPerMsg(info.costPerMsg);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setOverrideConvId(null);
  }, []);

  return {
    messages,
    isLoading,
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
