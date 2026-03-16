/**
 * TypeScript interfaces for DevPilot entities
 */

export interface Conversation {
  id: string;
  title: string;
  status: 'draft' | 'submitted' | 'archived';
  created_by: string;
  submitted_feature_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationListItem extends Conversation {
  submitted_feature_code: string | null;
  submitted_feature_title: string | null;
  message_count: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: MessageMetadata | null;
  created_at: string;
}

export type MessageMetadata = DedupWarningMetadata | ProposalMetadata;

export interface DedupWarningMetadata {
  type: 'dedup_warning';
  matches: DedupMatch[];
}

export interface ProposalMetadata {
  type: 'proposal';
  proposal?: AdminProposal | MemberProposal;
  proposals?: Array<AdminProposal | MemberProposal>;
}

export interface DedupMatch {
  feature_code: string;
  title: string;
  similarity: 'high' | 'medium';
  status: 'released' | 'proposed' | 'approved' | 'in_development';
  description_excerpt: string;
  recommendation: 'use_existing' | 'enhance_existing' | 'converge';
}

export interface AdminProposal {
  title: string;
  description: string;
  acceptance_criteria: string[];
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  category: 'toolkit' | 'business_module' | null;
  spec_section: string;
  problem_statement?: string;
  solution?: string;
}

export interface MemberProposal {
  title: string;
  description: string;
  acceptance_criteria: string[];
}

export interface TriageResult {
  passed: boolean;
  matches: DedupMatch[];
}

export interface SubmitProposalResponse {
  feature: {
    id: string;
    feature_code: string;
    title: string;
    status: 'proposed';
    priority: string;
    category: string | null;
  };
  dedup_check: TriageResult;
}

/** Type guard: check if proposal has admin fields */
export function isAdminProposal(
  proposal: AdminProposal | MemberProposal
): proposal is AdminProposal {
  return 'priority' in proposal && 'category' in proposal;
}
