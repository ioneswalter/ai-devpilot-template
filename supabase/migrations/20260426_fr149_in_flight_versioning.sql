-- FR-149 v1.1 patch (T041): drop UNIQUE on ideation_conversations.submitted_feature_id
--
-- Background: every version-bump merge creates a new conversation→feature link, but
-- the 1:1 unique constraint blocks any subsequent bump (forces clearing prior
-- conversations' back-links, losing history). Replace with a non-unique index so
-- multiple conversations can legitimately reference the same feature across its
-- version history.

ALTER TABLE ideation_conversations
  DROP CONSTRAINT IF EXISTS ideation_conversations_submitted_feature_id_key;

CREATE INDEX IF NOT EXISTS idx_ideation_conversations_submitted_feature_id
  ON ideation_conversations (submitted_feature_id)
  WHERE submitted_feature_id IS NOT NULL;
