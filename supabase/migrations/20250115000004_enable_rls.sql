-- Enable Row Level Security (RLS) on all tables
-- This ensures data access is controlled by policies, not just application logic

-- Enable RLS on all tables (with existence checks)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON customers FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers') THEN
    ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_providers' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON service_providers FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_requests') THEN
    ALTER TABLE job_requests ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_requests' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON job_requests FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_matches') THEN
    ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_matches' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON job_matches FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
    ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bids' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON bids FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bid_messages') THEN
    ALTER TABLE bid_messages ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bid_messages' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON bid_messages FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN
    ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_executions' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON job_executions FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'execution_messages') THEN
    ALTER TABLE execution_messages ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'execution_messages' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON execution_messages FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'escrow_payments') THEN
    ALTER TABLE escrow_payments ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'escrow_payments' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON escrow_payments FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'membership_enrollments') THEN
    ALTER TABLE membership_enrollments ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'membership_enrollments' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON membership_enrollments FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON reviews FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mediation_cases') THEN
    ALTER TABLE mediation_cases ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mediation_cases' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON mediation_cases FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Service role bypass') THEN
      CREATE POLICY "Service role bypass" ON notifications FOR ALL TO service_role USING (true);
    END IF;
  END IF;
END $$;

-- Note: Specific user-level RLS policies will be added in later migrations
-- as they depend on user context and business logic
