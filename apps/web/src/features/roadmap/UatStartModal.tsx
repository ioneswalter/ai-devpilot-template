/**
 * UatStartModal — confirm dialog opened when an admin clicks the UAT pipeline pill
 * on a feature that has finished Test but has no UAT package yet (status = in_testing).
 *
 * Equivalent UX to dragging the card to the Acceptance column on the Board view, but
 * surfaced from the List view's pipeline bar so admins do not have to switch views.
 * Drag-and-drop in handleTransitionConfirm is unchanged.
 *
 * Two-phase UI:
 *   1. confirm — explain what Start does; CLI snippet is hidden so the user cannot copy
 *      it before the package exists (would produce "no package" errors in \uat-review).
 *   2. ready   — after the package is generated, reveal the CLI snippet + Copy button,
 *      then continue into the review panel.
 */

import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { uatApiMethods } from '../../lib/api/uat-api';
import type { ProductFeature } from './roadmap-helpers';

interface UatStartModalProps {
  feature: ProductFeature | null;
  onClose: () => void;
  onContinueToReview: (feature: ProductFeature) => void;
}

type Phase = 'confirm' | 'ready';

export function UatStartModal({ feature, onClose, onContinueToReview }: UatStartModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!feature) return null;

  const cliCommand = `\\uat-review ${feature.feature_code}`;

  const reset = () => {
    setPhase('confirm');
    setBusy(false);
    setError(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await uatApiMethods.generatePackage(feature.id, 'manual');
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate UAT package');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const handleContinue = () => {
    reset();
    onContinueToReview(feature);
  };

  return (
    <Modal isOpen={!!feature} onClose={handleClose} size="md">
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {phase === 'confirm'
              ? `Start Acceptance Cycle for ${feature.feature_code}`
              : `Acceptance Cycle Started — ${feature.feature_code}`}
          </h2>
          <p className="text-sm text-gray-600 mt-1">{feature.title}</p>
        </div>

        {phase === 'confirm' ? (
          <div className="text-sm text-gray-700 space-y-2">
            <p>Confirming will:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Generate a UAT package from the curated scenarios + acceptance criteria</li>
              <li>
                Transition status from <strong>In Testing</strong> to <strong>In Acceptance</strong>
              </li>
              <li>Open the UAT review panel so the BP can begin per-item review</li>
            </ul>
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-700 space-y-2">
              <p>The package was generated and the status is now <strong>In Acceptance</strong>.</p>
              <p>Copy the command below and run it in Claude Code to drive the BP review:</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Run this in Claude Code
              </label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded font-mono text-sm text-gray-800">
                  {cliCommand}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="p-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {phase === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={busy}
                className="px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors disabled:opacity-60"
              >
                {busy ? 'Starting…' : 'Start Acceptance Cycle'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Continue to Review Panel
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
