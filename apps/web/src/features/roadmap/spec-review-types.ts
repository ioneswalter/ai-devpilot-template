/**
 * Frontend types for the Spec Review and Approval Workflow (FR-091)
 */

// Review item types
export type ReviewItemType = 'criterion' | 'test_case' | 'edge_case' | 'description';
export type ReviewItemSource = 'ai_generated' | 'original' | 'manual';
export type ReviewItemDecision = 'pending' | 'accepted' | 'rejected' | 'modified';
export type ReviewStatus = 'in_review' | 'approved' | 'sent_back';

export interface ReviewComment {
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export interface ReviewItem {
  id: string;
  review_id: string;
  item_type: ReviewItemType;
  source: ReviewItemSource;
  content: string;
  original_content: string | null;
  decision: ReviewItemDecision;
  decided_by: string | null;
  decided_at: string | null;
  comments: ReviewComment[];
  sort_order: number;
}

export interface SpecReview {
  id: string;
  feature_id: string;
  reviewer_id: string;
  reviewer_name: string | null;
  status: ReviewStatus;
  feedback: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewHistoryEntry {
  id: string;
  status: ReviewStatus;
  reviewer_name: string | null;
  created_at: string;
}

// API response types
export interface StartReviewResponse {
  review: SpecReview;
  items: ReviewItem[];
}

export interface GetReviewResponse {
  review: SpecReview;
  items: ReviewItem[];
  history?: ReviewHistoryEntry[];
}

export interface UpdateReviewRequest {
  review_id: string;
  version: number;
  updates?: Array<{
    item_id: string;
    decision?: ReviewItemDecision;
    content?: string;
    comment?: string;
  }>;
  new_items?: Array<{
    item_type: ReviewItemType;
    content: string;
  }>;
}

export interface UpdateReviewResponse {
  review: { id: string; version: number; updated_at: string };
  updated_items: Array<{ id: string; decision: string; updated_at: string }>;
  new_items?: Array<{ id: string; item_type: string; content: string }>;
}

export interface ApproveReviewResponse {
  feature: {
    id: string;
    feature_code: string;
    status: 'approved';
    acceptance_criteria: string[];
    updated_at: string;
  };
  test_cases_created: number;
  review: { id: string; status: 'approved'; updated_at: string };
}

export interface SendBackResponse {
  review: { id: string; status: 'sent_back'; feedback: string; updated_at: string };
  feature: { id: string; status: 'proposed'; updated_at: string };
}

// Component prop types
export interface ReviewItemCardProps {
  item: ReviewItem;
  isReviewActive: boolean;
  onDecision: (itemId: string, decision: ReviewItemDecision, content?: string) => void;
  onComment: (itemId: string, comment: string) => void;
}

export interface SpecReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  onClose: () => void;
  onReviewComplete: () => void;
}
