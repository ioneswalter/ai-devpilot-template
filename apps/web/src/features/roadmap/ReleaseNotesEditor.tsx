/**
 * ReleaseNotesEditor - Editor component for release notes with markdown preview
 * Used within ReleasePanel detail view to edit generated or custom release notes
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { generateReleaseNotes, updateRelease } from '@/lib/api/admin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const FileTextIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const EyeIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const LoaderIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
const SaveIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const WandIcon = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 4-1.17 2.34L11.5 7.5l2.33 1.16L15 11l1.17-2.34L18.5 7.5l-2.33-1.16z" />
    <path d="m2 22 10-10" />
    <path d="m12 12 4-4" />
  </svg>
);

interface ReleaseNotesEditorProps {
  releaseId: string;
  initialNotes?: string;
  featureIds: string[];
  onNotesChange?: (notes: string) => void;
  readOnly?: boolean;
}

export function ReleaseNotesEditor({
  releaseId,
  initialNotes = '',
  featureIds,
  onNotesChange,
  readOnly = false,
}: ReleaseNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const queryClient = useQueryClient();

  const generateNotesMutation = useMutation({
    mutationFn: () => generateReleaseNotes({ feature_ids: featureIds }),
    onSuccess: (result: unknown) => {
      const generatedNotes = typeof result === 'string' ? result : String(result ?? '');
      setNotes(generatedNotes);
      setHasUnsavedChanges(true);
      onNotesChange?.(generatedNotes);
    },
    onError: (error: unknown) => {
      console.error('Failed to generate release notes:', error);
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: (notesContent: string) => updateRelease({ id: releaseId, notes: notesContent }),
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['releases'] });
      queryClient.invalidateQueries({ queryKey: ['release', releaseId] });
    },
    onError: (error: unknown) => {
      console.error('Failed to save release notes:', error);
    },
  });

  const handleNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      setHasUnsavedChanges(value !== initialNotes);
      onNotesChange?.(value);
    },
    [initialNotes, onNotesChange]
  );

  const handleGenerate = useCallback(() => {
    if (featureIds.length === 0) {
      console.error('No features selected for this release');
      return;
    }
    generateNotesMutation.mutate();
  }, [featureIds, generateNotesMutation]);

  const handleSave = useCallback(() => {
    if (!hasUnsavedChanges) return;
    saveNotesMutation.mutate(notes);
  }, [notes, hasUnsavedChanges, saveNotesMutation]);

  const renderMarkdown = useCallback((text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) {
        return (
          <h1 key={i} className="text-2xl font-bold mb-4">
            {line.slice(2)}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={i} className="text-xl font-semibold mb-3">
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h3 key={i} className="text-lg font-medium mb-2">
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith('- ')) {
        return (
          <li key={i} className="ml-4 list-disc">
            {line.slice(2)}
          </li>
        );
      }
      if (line.startsWith('* ')) {
        return (
          <li key={i} className="ml-4 list-disc">
            {line.slice(2)}
          </li>
        );
      }
      if (line.match(/^\d+\. /)) {
        return (
          <li key={i} className="ml-4 list-decimal">
            {line.replace(/^\d+\. /, '')}
          </li>
        );
      }
      if (line.startsWith('> ')) {
        return (
          <blockquote key={i} className="border-l-4 border-gray-300 pl-4 italic mb-2">
            {line.slice(2)}
          </blockquote>
        );
      }
      if (line.match(/`([^`]+)`/)) {
        return (
          <p
            key={i}
            className="mb-2"
            dangerouslySetInnerHTML={{
              __html: line.replace(
                /`([^`]+)`/g,
                '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>'
              ),
            }}
          />
        );
      }
      if (line.trim() === '') {
        return <br key={i} />;
      }
      return (
        <p key={i} className="mb-2">
          {line}
        </p>
      );
    });
  }, []);

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generateNotesMutation.isPending || featureIds.length === 0}
              variant="outline"
              size="sm"
            >
              {generateNotesMutation.isPending ? (
                <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <WandIcon className="w-4 h-4 mr-2" />
              )}
              Generate Notes
            </Button>
            {featureIds.length === 0 && (
              <span className="text-sm text-gray-500">Select features to generate notes</span>
            )}
          </div>

          {hasUnsavedChanges && (
            <Button onClick={handleSave} disabled={saveNotesMutation.isPending} size="sm">
              {saveNotesMutation.isPending ? (
                <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <SaveIcon className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      )}

      <Card className="p-4">
        {/* Tab buttons */}
        <div className="grid w-full grid-cols-2 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'edit'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileTextIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'preview'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <EyeIcon className="w-4 h-4" />
            Preview
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'edit' && (
          <div className="mt-4">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Enter release notes here... Use Markdown formatting for better presentation."
              className="w-full min-h-[400px] font-mono text-sm p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              readOnly={readOnly}
            />
            {!readOnly && (
              <div className="mt-2 text-sm text-gray-500">
                <p>Tip: Use Markdown syntax for formatting:</p>
                <ul className="mt-1 ml-4 space-y-1">
                  <li># Heading 1, ## Heading 2, ### Heading 3</li>
                  <li>- or * for bullet points</li>
                  <li>1. for numbered lists</li>
                  <li>`code` for inline code</li>
                  <li>{'>'} for blockquotes</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="mt-4">
            <div className="min-h-[400px] prose prose-sm max-w-none p-4 border rounded-md bg-gray-50">
              {notes ? (
                <div className="space-y-2">{renderMarkdown(notes)}</div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  No content to preview
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {generateNotesMutation.isPending && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <LoaderIcon className="w-5 h-5 animate-spin mr-2" />
          Generating release notes from selected features...
        </div>
      )}
    </div>
  );
}
