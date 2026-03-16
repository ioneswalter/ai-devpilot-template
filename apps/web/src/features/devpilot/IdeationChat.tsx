/**
 * IdeationChat — Main chat interface for AI-powered feature ideation
 * Displays message history, input field, and handles sending messages
 */

import { useState, useRef, useEffect } from 'react';
import { SendIcon, LoaderIcon, SparklesIcon, AlertTriangleIcon } from './icons';
import type { ConversationMessage, DedupMatch } from './types';

interface IdeationChatProps {
  messages: ConversationMessage[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (message: string) => void;
  /** When true, force-collapse the "Your idea" panel (e.g. when proposal panel is visible) */
  forceCollapsed?: boolean;
}

export function IdeationChat({ messages, isLoading, error, onSendMessage, forceCollapsed }: IdeationChatProps) {
  const [input, setInput] = useState('');
  const [inputExpanded, setInputExpanded] = useState(messages.length === 0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-collapse when proposal panel opens
  useEffect(() => {
    if (forceCollapsed) setInputExpanded(false);
  }, [forceCollapsed]);

  useEffect(() => {
    if (inputExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputExpanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInput('');
    setInputExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full">
      {/* AI conversation panel */}
      <div className={`${forceCollapsed ? 'flex-1' : inputExpanded ? 'md:w-2/3' : 'flex-1'} flex flex-col h-full ${forceCollapsed ? '' : 'border-r'}`}>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <SparklesIcon className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Start your ideation</h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Describe a problem you want to solve or a feature you&apos;d like to see.
                I&apos;ll help you refine it and check for existing solutions.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <SparklesIcon className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="bg-gray-100 rounded-xl px-4 py-3">
                <LoaderIcon className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Collapsible vertical input panel — hidden entirely when proposal panel is open */}
      {forceCollapsed ? null : inputExpanded ? (
        <div className="md:w-1/3 flex flex-col bg-white">
          <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your idea</span>
            <button
              type="button"
              onClick={() => setInputExpanded(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Collapse
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your idea or request changes to the proposal...&#10;&#10;Shift+Enter for new line, Enter to send"
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="mt-2 w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <SendIcon className="h-4 w-4" />
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setInputExpanded(true)}
          className="w-10 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors border-l cursor-pointer"
          title="Expand to type"
        >
          <span className="text-xs font-semibold text-gray-400 [writing-mode:vertical-lr] rotate-180 tracking-widest uppercase">
            Your idea
          </span>
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';

  // Check for dedup warnings in metadata
  const dedupMatches: DedupMatch[] =
    message.metadata?.type === 'dedup_warning' ? message.metadata.matches : [];

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-blue-100' : 'bg-emerald-100'
        }`}
      >
        {isUser ? (
          <span className="text-blue-600 text-xs font-bold">U</span>
        ) : (
          <SparklesIcon className="h-4 w-4 text-emerald-600" />
        )}
      </div>
      <div className={`max-w-[75%] space-y-2 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
          }`}
        >
          <div className="whitespace-pre-wrap">{stripMetadataBlocks(message.content)}</div>
        </div>

        {dedupMatches.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">Existing features found</span>
            </div>
            {dedupMatches.map((match) => (
              <div key={match.feature_code} className="text-xs text-amber-900 mb-1">
                <span className="font-mono font-bold">{match.feature_code}</span>{' '}
                <span>{match.title}</span>{' '}
                <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[10px]">
                  {match.status}
                </span>{' '}
                <span className="text-amber-600">({match.recommendation.replace(/_/g, ' ')})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Strip JSON metadata blocks from display text */
function stripMetadataBlocks(content: string): string {
  return content.replace(/```json\s*\{[\s\S]*?"type"\s*:\s*"(?:dedup_warning|proposal)"[\s\S]*?\}[\s\S]*?```/g, '').trim();
}
