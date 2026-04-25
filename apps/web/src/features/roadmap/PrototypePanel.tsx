/**
 * PrototypePanel — Renders an attached prototype inline if one exists,
 * otherwise shows a "Run \generate-prototype" hint.
 *
 * FR-089 v1.1 J3 (C2): consumer-side wiring of prototype_attachments into
 * the Spec Review surface.
 */

import { CopyableCommand } from '@/components/ui/CopyableCommand';
import type { PrototypeAttachmentState } from '@/features/devpilot/hooks/usePrototypeAttachment';

interface PrototypePanelProps {
  featureCode: string;
  attachment: PrototypeAttachmentState;
}

export function PrototypePanel({ featureCode, attachment }: PrototypePanelProps) {
  if (attachment.hasAttachment && attachment.content) {
    return (
      <div className="border-b border-gray-200" data-testid="prototype-panel-rendered">
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
          <p className="text-xs text-indigo-700">Prototype ({attachment.prototypeType ?? 'attached'})</p>
          <p className="text-[11px] text-indigo-500">
            Iterate with <CopyableCommand command={`\\iterate-prototype ${featureCode}`} className="bg-indigo-100" />
          </p>
        </div>
        <iframe
          srcDoc={attachment.content}
          sandbox="allow-scripts"
          title={`Prototype for ${featureCode}`}
          className="w-full bg-white"
          style={{ border: 'none', minHeight: '320px' }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100" data-testid="prototype-panel-hint">
      <p className="text-xs text-indigo-700">
        Run <CopyableCommand command={`\\generate-prototype ${featureCode}`} className="bg-indigo-100" /> in Claude Code to create a visual prototype for this feature.
      </p>
    </div>
  );
}
