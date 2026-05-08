/**
 * FR-130 v2.1 — BP evidence capture + observation cell.
 *
 * Per-row UX shown when the BP intends to Pass an item:
 *   1. Optional free-text observation field (max 500 chars).
 *   2. Evidence picker — auto-capture via FR-161 extension when available,
 *      manual file upload as fallback.
 *   3. AI caption pre-fills the observation field after auto-capture.
 *
 * The Pass action is gated by AC-32 when `evidenceRequired=true` and no
 * `evidencePath` has been set yet.
 */

import { useState, useEffect, useCallback } from 'react';
import { uploadEvidenceFile } from '@/lib/uat-evidence-upload';
import { requestExtensionCapture } from '@/lib/uat-extension-capture';
import { fetchCaptionForDecision } from '@/lib/api/uat-review-api';

interface EvidenceCaptureCellProps {
  decisionId: string;
  featureId: string;
  evidenceRequired: boolean;
  observationText: string;
  evidencePath: string | null;
  aiCaption: string | null;
  onObservationChange: (text: string) => void;
  onEvidenceChange: (path: string | null, aiCaption: string | null) => void;
  disabled?: boolean;
}

const MAX_OBSERVATION = 500;

export function EvidenceCaptureCell({
  decisionId,
  featureId,
  evidenceRequired,
  observationText,
  evidencePath,
  aiCaption,
  onObservationChange,
  onEvidenceChange,
  disabled = false,
}: EvidenceCaptureCellProps) {
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectExtension().then((ok) => {
      if (!cancelled) setExtensionDetected(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAutoCapture = useCallback(async () => {
    setError(null);
    setIsCapturing(true);
    try {
      const result = await requestExtensionCapture({
        feature_id: featureId,
        decision_id: decisionId,
      });
      if (!result.ok) {
        setError(result.error ?? 'Capture failed — use manual upload.');
        return;
      }
      onEvidenceChange(result.capture_path, null);
      // FR-130 v2.1 / AC-40 — fetch AI caption async, pre-fill observation.
      try {
        const captionResp = await fetchCaptionForDecision(decisionId, result.capture_path);
        if (captionResp.ai_caption) {
          onEvidenceChange(result.capture_path, captionResp.ai_caption);
          if (!observationText.trim()) {
            onObservationChange(captionResp.ai_caption.slice(0, MAX_OBSERVATION));
          }
        }
      } catch {
        // Caption is metadata; absence is non-fatal.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed');
    } finally {
      setIsCapturing(false);
    }
  }, [decisionId, featureId, observationText, onEvidenceChange, onObservationChange]);

  const handleManualUpload = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      try {
        const path = await uploadEvidenceFile(file, featureId, decisionId);
        onEvidenceChange(path, null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [decisionId, featureId, onEvidenceChange]
  );

  return (
    <div className="space-y-2 border-t border-gray-100 pt-2 mt-2">
      <ObservationField
        value={observationText}
        onChange={onObservationChange}
        disabled={disabled}
        aiCaption={aiCaption}
      />

      {evidenceRequired && (
        <EvidenceRow
          evidencePath={evidencePath}
          extensionDetected={extensionDetected}
          isCapturing={isCapturing}
          isUploading={isUploading}
          onAutoCapture={handleAutoCapture}
          onManualUpload={handleManualUpload}
          onClear={() => onEvidenceChange(null, null)}
          disabled={disabled}
        />
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}

function ObservationField({
  value,
  onChange,
  disabled,
  aiCaption,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
  aiCaption: string | null;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
        Observation
        {aiCaption && value === aiCaption && (
          <span className="text-violet-600 normal-case font-medium">
            ✨ AI suggestion (editable)
          </span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_OBSERVATION))}
        placeholder="Optional — what did you observe?"
        rows={2}
        disabled={disabled}
        className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400"
      />
      <p className="text-[10px] text-gray-400 text-right">
        {value.length} / {MAX_OBSERVATION}
      </p>
    </div>
  );
}

interface EvidenceRowProps {
  evidencePath: string | null;
  extensionDetected: boolean | null;
  isCapturing: boolean;
  isUploading: boolean;
  onAutoCapture: () => void;
  onManualUpload: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
}

function EvidenceRow({
  evidencePath,
  extensionDetected,
  isCapturing,
  isUploading,
  onAutoCapture,
  onManualUpload,
  onClear,
  disabled,
}: EvidenceRowProps) {
  if (evidencePath) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
        <span className="text-xs text-emerald-700">📎 Evidence captured</span>
        <code className="text-[10px] text-emerald-800 font-mono truncate flex-1">
          {evidencePath}
        </code>
        <button
          onClick={onClear}
          disabled={disabled}
          className="text-[10px] text-red-600 hover:text-red-800 underline"
        >
          Replace
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        Evidence required
      </p>
      {extensionDetected ? (
        <button
          onClick={onAutoCapture}
          disabled={disabled || isCapturing}
          className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
        >
          {isCapturing ? '📸 Capturing…' : '✨ Capture page (auto)'}
        </button>
      ) : (
        <label className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer">
          {isUploading ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={disabled || isUploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onManualUpload(f);
            }}
          />
        </label>
      )}
      {extensionDetected === false && (
        <span className="text-[10px] text-gray-400">Install SpecKit DevTools for auto-capture</span>
      )}
    </div>
  );
}

// FR-130 v2.1 — detect FR-161 extension via the existing CHECK_EXTENSION ping.
async function detectExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    const requestId = `uat-detect-${Date.now()}-${Math.random()}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(false);
    }, 1500);
    function handler(ev: MessageEvent) {
      const data = ev.data;
      if (!data || data.type !== 'SPECKIT_RESPONSE' || data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(Boolean(data.success));
    }
    window.addEventListener('message', handler);
    window.postMessage({ type: 'SPECKIT_CHECK_EXTENSION', requestId }, '*');
  });
}
