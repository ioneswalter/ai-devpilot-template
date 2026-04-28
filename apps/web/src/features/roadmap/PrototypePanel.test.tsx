/**
 * Component tests for PrototypePanel — FR-089 v1.1 J3 (C2).
 * Verifies the conditional rendering: prototype iframe vs run-command hint.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrototypePanel } from './PrototypePanel';
import type { PrototypeAttachmentState } from '@/features/devpilot/hooks/usePrototypeAttachment';

const noAttachment: PrototypeAttachmentState = {
  content: null,
  prototypeType: null,
  isLoading: false,
  hasAttachment: false,
};

const withAttachment: PrototypeAttachmentState = {
  content:
    '<!DOCTYPE html><html><body><svg><text x="10" y="20">demo prototype</text></svg></body></html>',
  prototypeType: 'sequence',
  isLoading: false,
  hasAttachment: true,
};

describe('PrototypePanel', () => {
  it('renders the run-command hint when no attachment exists', () => {
    render(<PrototypePanel featureCode="FR-089" attachment={noAttachment} />);
    expect(screen.getByTestId('prototype-panel-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('prototype-panel-rendered')).not.toBeInTheDocument();
    expect(screen.getByText(/generate-prototype FR-089/)).toBeInTheDocument();
  });

  it('renders the prototype iframe when attachment exists', () => {
    render(<PrototypePanel featureCode="FR-130" attachment={withAttachment} />);
    expect(screen.getByTestId('prototype-panel-rendered')).toBeInTheDocument();
    expect(screen.queryByTestId('prototype-panel-hint')).not.toBeInTheDocument();
    const iframe = screen.getByTitle('Prototype for FR-130') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('srcdoc')).toContain('<svg>');
  });

  it('shows the prototype type label when attachment is present', () => {
    render(<PrototypePanel featureCode="FR-130" attachment={withAttachment} />);
    expect(screen.getByText(/Prototype \(sequence\)/)).toBeInTheDocument();
  });

  it('shows the iterate hint when attachment is present, not the generate hint', () => {
    render(<PrototypePanel featureCode="FR-130" attachment={withAttachment} />);
    expect(screen.getByText(/iterate-prototype FR-130/)).toBeInTheDocument();
    expect(screen.queryByText(/generate-prototype FR-130/)).not.toBeInTheDocument();
  });

  it('falls back to the hint when hasAttachment is true but content is null', () => {
    const inconsistent: PrototypeAttachmentState = { ...withAttachment, content: null };
    render(<PrototypePanel featureCode="FR-089" attachment={inconsistent} />);
    expect(screen.getByTestId('prototype-panel-hint')).toBeInTheDocument();
  });
});
