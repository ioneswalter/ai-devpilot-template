-- FR-140: AI Prototype Builder
-- Creates prototype_versions and prototype_attachments tables with RLS

-- Prototype Versions: stores each generated/iterated prototype
-- Note: ideation_conversations.id and conversation_messages.id are TEXT (not UUID)
CREATE TABLE IF NOT EXISTS prototype_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES ideation_conversations(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
  prototype_type VARCHAR(20) NOT NULL CHECK (prototype_type IN ('ui', 'flowchart', 'process')),
  content TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  feedback_prompt TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, version_number)
);

CREATE INDEX idx_prototype_versions_conv ON prototype_versions(conversation_id);
CREATE INDEX idx_prototype_versions_current ON prototype_versions(conversation_id, is_current);

-- Prototype Attachments: links finalised prototype to a feature
-- Note: product_features.id is TEXT (not UUID)
CREATE TABLE IF NOT EXISTS prototype_attachments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feature_id TEXT NOT NULL UNIQUE REFERENCES product_features(id) ON DELETE CASCADE,
  prototype_version_id TEXT NOT NULL UNIQUE REFERENCES prototype_versions(id) ON DELETE CASCADE,
  prototype_type VARCHAR(20) NOT NULL,
  render_url TEXT,
  total_versions INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: prototype_versions
ALTER TABLE prototype_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation prototypes"
  ON prototype_versions FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM ideation_conversations
      WHERE created_by = auth.uid()::text
    )
  );

CREATE POLICY "Service role can insert prototypes"
  ON prototype_versions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update prototypes"
  ON prototype_versions FOR UPDATE
  USING (true);

-- RLS: prototype_attachments
ALTER TABLE prototype_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view prototype attachments"
  ON prototype_attachments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert prototype attachments"
  ON prototype_attachments FOR INSERT
  WITH CHECK (true);
