/**
 * Hook for managing ideation chat state
 * Handles messages, loading, sending, and proposal extraction
 */

import { useState, useCallback, useEffect } from 'react';
import { devpilotApi } from '@/lib/api-client';
import type { ConversationMessage, MessageMetadata } from '../types';

function formatModelLabel(modelId: string): string {
  if (modelId.includes('opus')) return 'Opus';
  if (modelId.includes('sonnet')) return 'Sonnet';
  if (modelId.includes('haiku')) return 'Haiku';
  return modelId;
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
  const [modelLabel, setModelLabel] = useState<string | null>(null);

  // Fetch current model on mount so the label shows immediately
  useEffect(() => {
    devpilotApi.getChatModel()
      .then((res) => setModelLabel(formatModelLabel(res.data.model)))
      .catch(() => { /* silent — label just won't show */ });
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
        const response = await devpilotApi.sendMessage(convId, message);
        const { user_message, assistant_message, model } = response.data;
        if (model) setModelLabel(formatModelLabel(model));

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
    [effectiveConvId, conversationId, isLoading]
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
  };
}
