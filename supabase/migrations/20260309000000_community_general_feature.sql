-- Community Hub: Insert sentinel record for general chat
-- All community chat messages are stored as feature_comments anchored to this record
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features') THEN
    INSERT INTO product_features (
      id,
      feature_code,
      title,
      description,
      acceptance_criteria,
      feature_type,
      priority,
      status,
      spec_section,
      related_user_stories,
      updated_at
    ) VALUES (
      gen_random_uuid()::text,
      'COMMUNITY-GENERAL',
      'Community General Chat',
      'Sentinel record anchoring the community hub general chat feed. All community messages are stored as feature_comments linked to this feature.',
      '["Community chat messages display in real-time", "Any signed-in user can post messages", "Messages support replies up to 2 levels deep"]'::jsonb,
      'community',
      'P1',
      'released',
      'Community',
      ARRAY['US-COMMUNITY-001'],
      now()
    ) ON CONFLICT (feature_code) DO NOTHING;
  END IF;
END $$;
