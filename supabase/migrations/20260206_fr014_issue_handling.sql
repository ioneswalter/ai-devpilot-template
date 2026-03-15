-- FR-014: Issue Handling Workflow
-- Adds tracking fields to job_executions and creates additional_work_escrows table

-- Add new columns to job_executions for issue tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN
    ALTER TABLE job_executions
    ADD COLUMN IF NOT EXISTS issue_reported_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS additional_work_response TEXT,
    ADD COLUMN IF NOT EXISTS additional_work_responded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS additional_escrow_id UUID;
  END IF;
END $$;

-- Create additional_work_escrows table for additional work payments
-- Only create if referenced tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'escrow_payments')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers')
  THEN
    CREATE TABLE IF NOT EXISTS additional_work_escrows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_execution_id UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
      original_escrow_id UUID NOT NULL REFERENCES escrow_payments(id),
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,

      -- Amounts (in cents)
      additional_amount INT NOT NULL,
      platform_fee INT NOT NULL,
      total_amount INT NOT NULL,

      -- Payment processing
      stripe_payment_intent_id TEXT UNIQUE,
      payment_method TEXT,

      -- Status tracking: PENDING, HELD, RELEASED, CANCELLED
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,

      -- Transfer details
      stripe_transfer_id TEXT UNIQUE,
      payout_amount INT,

      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create indexes for efficient queries
    CREATE INDEX IF NOT EXISTS idx_additional_work_escrows_execution ON additional_work_escrows(job_execution_id);
    CREATE INDEX IF NOT EXISTS idx_additional_work_escrows_status ON additional_work_escrows(status);
    CREATE INDEX IF NOT EXISTS idx_additional_work_escrows_customer ON additional_work_escrows(customer_id);
    CREATE INDEX IF NOT EXISTS idx_additional_work_escrows_provider ON additional_work_escrows(provider_id);

    -- Add foreign key from job_executions to additional_work_escrows
    ALTER TABLE job_executions
    ADD CONSTRAINT fk_job_executions_additional_escrow
    FOREIGN KEY (additional_escrow_id) REFERENCES additional_work_escrows(id)
    ON DELETE SET NULL;

    -- RLS policies for additional_work_escrows
    ALTER TABLE additional_work_escrows ENABLE ROW LEVEL SECURITY;

    -- Customers can view their own additional escrows
    CREATE POLICY "Customers can view own additional escrows"
    ON additional_work_escrows FOR SELECT
    TO authenticated
    USING (
      customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    );

    -- Providers can view additional escrows for their jobs
    CREATE POLICY "Providers can view own additional escrows"
    ON additional_work_escrows FOR SELECT
    TO authenticated
    USING (
      provider_id IN (
        SELECT id FROM service_providers WHERE user_id = auth.uid()
      )
    );

    -- Service role can do everything
    CREATE POLICY "Service role full access to additional escrows"
    ON additional_work_escrows FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Add comment for documentation
    COMMENT ON TABLE additional_work_escrows IS 'FR-014: Stores escrow payments for additional work approved by customers when providers flag unexpected issues during jobs';
  END IF;
END $$;

-- Add comments on job_executions columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN
    COMMENT ON COLUMN job_executions.issue_reported_at IS 'FR-014: Timestamp when provider reported an issue';
    COMMENT ON COLUMN job_executions.additional_work_response IS 'FR-014: Customer response to issue - APPROVED, DECLINED, or ESCALATED';
    COMMENT ON COLUMN job_executions.additional_work_responded_at IS 'FR-014: Timestamp when customer responded to issue';
    COMMENT ON COLUMN job_executions.additional_escrow_id IS 'FR-014: Link to additional escrow if customer approved additional work';
  END IF;
END $$;
