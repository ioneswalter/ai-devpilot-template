-- FR-060 Improvement: Add flexible availability fields to marketplace_posts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_posts') THEN
    -- Add availability_type to switch between specific dates and flexible schedule
    ALTER TABLE marketplace_posts
      ADD COLUMN IF NOT EXISTS availability_type VARCHAR(20) DEFAULT 'flexible'
        CHECK (availability_type IN ('specific_dates', 'flexible'));

    -- Add availability_days for day selection (stored as JSON array of day names)
    -- Example: ['monday', 'saturday', 'sunday']
    ALTER TABLE marketplace_posts
      ADD COLUMN IF NOT EXISTS availability_days TEXT[] DEFAULT '{}';

    -- Add availability_times for time preference (stored as JSON array of time slots)
    -- Example: ['morning', 'evening']
    ALTER TABLE marketplace_posts
      ADD COLUMN IF NOT EXISTS availability_times TEXT[] DEFAULT '{}';

    -- Comment for documentation
    COMMENT ON COLUMN marketplace_posts.availability_type IS 'Type of availability: specific_dates (use available_from/to) or flexible (use days/times)';
    COMMENT ON COLUMN marketplace_posts.availability_days IS 'Array of days available: monday, tuesday, wednesday, thursday, friday, saturday, sunday';
    COMMENT ON COLUMN marketplace_posts.availability_times IS 'Array of time preferences: morning (6am-12pm), afternoon (12pm-5pm), evening (5pm-9pm)';
  END IF;
END $$;
