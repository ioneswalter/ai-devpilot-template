/**
 * GuidedStepEvidenceCapture — Evidence capture UI sections extracted from GuidedStepCard.
 */

import { useRef, useState } from 'react';
import type { CaptureEvidenceResult } from './guided-testing-types';

interface RemotePageCaptureProps {
  extensionAvailable: boolean;
  onCapture: () => Promise<void>;
  capturing: boolean;
  captureError?: string | null;
  lastCaptureSuccess?: boolean;
  lastCapture?: CaptureEvidenceResult | null;
  onUploadScreenshot?: (dataUrl: string) => void;
  onClearEvidence?: () => void;
}

export function RemotePageCapture({
  extensionAvailable,
  onCapture,
  capturing,
  captureError,
  lastCaptureSuccess,
  lastCapture,
  onUploadScreenshot,
  onClearEvidence,
}: RemotePageCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedPreview(dataUrl);
      onUploadScreenshot?.(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="mb-2">
      <p className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5 mb-1.5">
        Capture evidence using the extension on the test page, or upload a screenshot.
      </p>
      <div className="flex gap-1.5">
        {extensionAvailable && (
          <button
            onClick={onCapture}
            disabled={capturing}
            className="flex-1 text-xs py-1.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            {capturing ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                Loading...
              </span>
            ) : (
              'Load from Extension'
            )}
          </button>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 text-xs py-1.5 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          Upload Screenshot
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
      {captureError && <p className="mt-1 text-[10px] text-red-600">{captureError}</p>}
      {lastCaptureSuccess && !capturing && (
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-[10px] text-green-600 hover:text-green-700 underline"
          >
            {showPreview ? 'Hide preview' : 'Evidence loaded — click to preview'}
          </button>
          <button
            onClick={() => {
              setUploadedPreview(null);
              onClearEvidence?.();
            }}
            className="text-[10px] text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      )}
      {showPreview && lastCapture && (
        <div className="mt-2 space-y-1.5 border border-green-200 rounded p-2 bg-green-50/50">
          {lastCapture.screenshot && (
            <img
              src={lastCapture.screenshot}
              alt="Captured screenshot"
              className="w-full rounded border border-gray-200"
            />
          )}
        </div>
      )}
      {uploadedPreview && !lastCaptureSuccess && (
        <div className="mt-2 border border-blue-200 rounded p-2 bg-blue-50/50">
          <img
            src={uploadedPreview}
            alt="Uploaded screenshot"
            className="w-full rounded border border-gray-200"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[10px] text-blue-600">Screenshot uploaded</p>
            <button
              onClick={() => {
                setUploadedPreview(null);
                onClearEvidence?.();
              }}
              className="text-[10px] text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SamePageCaptureProps {
  extensionAvailable: boolean;
  onCapture: () => Promise<void>;
  capturing: boolean;
  captureError?: string | null;
  lastCaptureSuccess?: boolean;
  lastCapture?: CaptureEvidenceResult | null;
}

export function SamePageCapture({
  extensionAvailable,
  onCapture,
  capturing,
  captureError,
  lastCaptureSuccess,
  lastCapture,
}: SamePageCaptureProps) {
  const [showPreview, setShowPreview] = useState(false);

  if (!extensionAvailable) return null;

  return (
    <div className="mb-2">
      <button
        onClick={onCapture}
        disabled={capturing}
        className="w-full text-xs py-1.5 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
      >
        {capturing ? (
          <span className="flex items-center justify-center gap-1.5">
            <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Capturing...
          </span>
        ) : (
          'Capture Evidence'
        )}
      </button>
      {captureError && <p className="mt-1 text-[10px] text-red-600">{captureError}</p>}
      {lastCaptureSuccess && !capturing && (
        <button
          onClick={() => setShowPreview((v) => !v)}
          className="mt-1 text-[10px] text-green-600 hover:text-green-700 underline"
        >
          {showPreview ? 'Hide preview' : 'Evidence captured — click to preview'}
        </button>
      )}
      {showPreview && lastCapture && (
        <div className="mt-2 space-y-1.5 border border-green-200 rounded p-2 bg-green-50/50">
          {lastCapture.screenshot && (
            <img
              src={lastCapture.screenshot}
              alt="Captured screenshot"
              className="w-full rounded border border-gray-200"
            />
          )}
          {lastCapture.console_output?.length > 0 && (
            <div className="text-[10px]">
              <span className="font-medium text-gray-700">Console: </span>
              <span className="text-gray-500">{lastCapture.console_output.length} entries</span>
            </div>
          )}
          {lastCapture.network_log?.length > 0 && (
            <div className="text-[10px]">
              <span className="font-medium text-gray-700">Network: </span>
              <span className="text-gray-500">{lastCapture.network_log.length} requests</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
