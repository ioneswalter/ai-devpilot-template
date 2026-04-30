/**
 * DeployStartModal — confirm dialog opened when an admin clicks the Deploy pipeline
 * pill on a feature that has finished UAT (status = in_acceptance).
 *
 * Unlike UatStartModal, there is no backend trigger — \deploy is a Claude Code slash
 * command that commits, pushes to the deploy branch, and auto-releases qualifying
 * features. This modal just surfaces the CLI snippet with a Copy button so the admin
 * can run it without context-switching to the terminal first.
 */

import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import type { ProductFeature } from './roadmap-helpers';

interface DeployStartModalProps {
  feature: ProductFeature | null;
  onClose: () => void;
}

export function DeployStartModal({ feature, onClose }: DeployStartModalProps) {
  const [copied, setCopied] = useState(false);

  if (!feature) return null;

  const cliCommand = '\\deploy';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Best-effort — clipboard API may be blocked in some browsers.
    }
  };

  return (
    <Modal isOpen={!!feature} onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Release {feature.feature_code}</h2>
          <p className="text-sm text-gray-600 mt-1">{feature.title}</p>
        </div>

        <div className="text-sm text-gray-700 space-y-2">
          <p>
            UAT is approved. Running <code className="font-mono text-gray-900">\deploy</code> will:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Run constitution + typecheck pre-deploy scans</li>
            <li>Commit any pending changes and push to the deploy branch</li>
            <li>
              Auto-release qualifying features (UAT approved + tests passed) and sync the roadmap
            </li>
          </ul>
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

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
