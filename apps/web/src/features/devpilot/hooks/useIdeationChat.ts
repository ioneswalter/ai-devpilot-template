/**
 * Hook for managing ideation chat state — with SSE streaming support
 * Handles messages, loading, sending, streaming, and proposal extraction
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [overrideConvId, setOverrideConvId] = useState<string | null>(null);
  const effectiveConvId = overrideConvId ?? conversationId;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [modelCostPerMsg, setModelCostPerMsg] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; label: string; costPerMsg: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);

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

      if (lazyConversationId && !conversationId) {
        setOverrideConvId(lazyConversationId);
      }

      setIsLoading(true);
      setError(null);
      setStreamingText('');

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
        const response = await devpilotApi.sendMessageStream(
          convId, message, selectedModelId ?? undefined,
        );

        await processSSEStream(response, tempUserMsg.id);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setStreamingText(null);
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveConvId, conversationId, isLoading, selectedModelId],
  );

  /** Process SSE stream from devpilot-chat edge function */
  async function processSSEStream(response: Response, tempUserId: string) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let messageSaved = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (currentEvent === 'message_saved') messageSaved = true;
              handleSSEEvent(currentEvent, parsed, tempUserId, accumulated);
              if (currentEvent === 'text_delta' && parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              }
            } catch { /* skip unparseable */ }
          }
        }
      }
    } finally {
      setStreamingText(null);
      // If stream ended without message_saved (e.g. edge function crashed after Claude
      // finished but before DB save), reload messages from DB as fallback
      if (!messageSaved && accumulated.length > 0) {
        const convId = overrideConvId ?? conversationId;
        if (convId) {
          // Small delay to let any in-flight DB writes complete
          await new Promise((r) => setTimeout(r, 1500));
          await loadMessages(convId);
        }
      }
    }
  }

  function handleSSEEvent(
    event: string,
    data: Record<string, unknown>,
    tempUserId: string,
    _accumulated: string,
  ) {
    if (event === 'user_message') {
      // Replace optimistic user message with real one from DB
      setMessages((prev) => prev.map((m) =>
        m.id === tempUserId
          ? { id: data.id as string, role: 'user', content: data.content as string, metadata: null, created_at: data.created_at as string }
          : m,
      ));
    }

    if (event === 'message_saved') {
      const am = data.assistant_message as Record<string, unknown>;
      if (!am) return;
      const model = data.model as string;
      if (model) {
        const info = getModelInfo(model);
        setModelLabel(info.label);
        setModelCostPerMsg(info.costPerMsg);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: am.id as string,
          role: 'assistant' as const,
          content: am.content as string,
          metadata: {
            ...((am.metadata as MessageMetadata) ?? {} as MessageMetadata),
            ...(data.cost != null ? { cost: data.cost as number } : {}),
            ...(model ? { model } : {}),
          } as MessageMetadata,
          created_at: am.created_at as string,
        },
      ]);
    }

    if (event === 'error') {
      setError(data.message as string || 'AI response failed');
    }
  }

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
    setMessages([]);
    setOverrideConvId(null);
  }, []);

  return {
    messages,
    isLoading,
    streamingText,
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
