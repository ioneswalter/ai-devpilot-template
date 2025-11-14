-- Enable Row Level Security (RLS) on all tables
-- This ensures data access is controlled by policies, not just application logic

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mediation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for Edge Functions with service key)
-- This allows server-side functions to bypass RLS when needed
CREATE POLICY "Service role bypass" ON customers FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON service_providers FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON job_requests FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON job_matches FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON bids FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON bid_messages FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON job_executions FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON execution_messages FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON escrow_payments FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON membership_enrollments FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON reviews FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON mediation_cases FOR ALL TO service_role USING (true);
CREATE POLICY "Service role bypass" ON notifications FOR ALL TO service_role USING (true);

-- Note: Specific user-level RLS policies will be added in later migrations
-- as they depend on user context and business logic
