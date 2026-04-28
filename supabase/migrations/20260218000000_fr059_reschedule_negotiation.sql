-- FR-059: Job Rescheduling Negotiation
-- Adds reschedule negotiation fields to job_executions table
-- Enables provider/customer to negotiate schedule changes before work starts

-- Add reschedule negotiation columns to job_executions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN
    ALTER TABLE job_executions
    ADD COLUMN IF NOT EXISTS reschedule_requested BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reschedule_status TEXT, -- 'PENDING_CUSTOMER', 'PENDING_PROVIDER', 'APPROVED', 'CANCELLED'
    ADD COLUMN IF NOT EXISTS reschedule_proposed_datetime TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reschedule_proposed_by TEXT, -- 'PROVIDER' or 'CUSTOMER'
    ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
    ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reschedule_responded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reschedule_original_datetime TIMESTAMPTZ, -- Original scheduled datetime before negotiation
    ADD COLUMN IF NOT EXISTS reschedule_iteration INTEGER DEFAULT 0; -- Counter for back-and-forth (max 3)

    -- Add check constraint for reschedule_status values
    ALTER TABLE job_executions
    DROP CONSTRAINT IF EXISTS job_executions_reschedule_status_check;

    ALTER TABLE job_executions
    ADD CONSTRAINT job_executions_reschedule_status_check
    CHECK (reschedule_status IS NULL OR reschedule_status IN ('PENDING_CUSTOMER', 'PENDING_PROVIDER', 'APPROVED', 'CANCELLED'));

    -- Add check constraint for reschedule_proposed_by values
    ALTER TABLE job_executions
    DROP CONSTRAINT IF EXISTS job_executions_reschedule_proposed_by_check;

    ALTER TABLE job_executions
    ADD CONSTRAINT job_executions_reschedule_proposed_by_check
    CHECK (reschedule_proposed_by IS NULL OR reschedule_proposed_by IN ('PROVIDER', 'CUSTOMER'));

    -- Index for finding pending reschedules
    CREATE INDEX IF NOT EXISTS idx_job_executions_reschedule_status
    ON job_executions(reschedule_status)
    WHERE reschedule_status IS NOT NULL;

    -- Comment for documentation
    COMMENT ON COLUMN job_executions.reschedule_requested IS 'Whether a reschedule has been requested';
    COMMENT ON COLUMN job_executions.reschedule_status IS 'Current status: PENDING_CUSTOMER, PENDING_PROVIDER, APPROVED, CANCELLED';
    COMMENT ON COLUMN job_executions.reschedule_proposed_datetime IS 'The currently proposed new datetime';
    COMMENT ON COLUMN job_executions.reschedule_proposed_by IS 'Who made the current proposal: PROVIDER or CUSTOMER';
    COMMENT ON COLUMN job_executions.reschedule_reason IS 'Reason provided for the reschedule request';
    COMMENT ON COLUMN job_executions.reschedule_iteration IS 'Counter for negotiation rounds (max 3)';
    COMMENT ON COLUMN job_executions.reschedule_original_datetime IS 'The original scheduled datetime before negotiation started';
  END IF;
END $$;

-- Insert the feature into product_features
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features') THEN
    INSERT INTO product_features (
      feature_code,
      title,
      description,
      acceptance_criteria,
      feature_type,
      priority,
      status,
      spec_section,
      related_user_stories
    ) VALUES (
      'FR-059',
      'Job Rescheduling Negotiation',
      'Enable job rescheduling with a negotiation workflow where either party (provider or customer) can request a schedule change. The other party can approve, counter-propose, or cancel the deal. Maximum 3 counter-proposals allowed before must approve or cancel. Work is blocked during negotiation.',
      to_jsonb(ARRAY[
        'Either party can request schedule change with proposed datetime and reason',
        'Other party can APPROVE, COUNTER-PROPOSE, or CANCEL',
        'Maximum 3 counter-proposals allowed before requiring approval or cancellation',
        'Work status updates blocked during active negotiation',
        'BID_ACCEPTED status shows job as already scheduled from bid timeline',
        'Cancel triggers escrow refund and notifies both parties'
      ]),
      'feature',
      'P1',
      'released',
      'Customer Journey',
      ARRAY['US-002']
    ) ON CONFLICT (feature_code) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      acceptance_criteria = EXCLUDED.acceptance_criteria,
      status = EXCLUDED.status,
      updated_at = NOW();
  END IF;
END $$;

-- Insert test cases for FR-059
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_cases')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features')
  THEN
    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-01', 'Provider requests reschedule', 'Verify provider can request reschedule from BID_ACCEPTED job', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-02', 'Customer sees reschedule request', 'Verify customer sees reschedule banner with proposed date and action buttons', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-03', 'Customer approves reschedule', 'Verify approving reschedule updates schedule to proposed datetime', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-04', 'Customer counter-proposes', 'Verify customer can propose different datetime and status flips to PENDING_PROVIDER', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-05', 'Provider responds to counter', 'Verify provider can approve or counter customer counter-proposal', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-06', 'Max iterations enforced', 'Verify Counter button disabled after 3 rounds of negotiation', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-07', 'Cancel deal refunds escrow', 'Verify cancelling during negotiation marks escrow as REFUNDED', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-08', 'Status updates blocked during negotiation', 'Verify job status buttons disabled when reschedule is pending', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-09', 'BID_ACCEPTED shows as scheduled', 'Verify timeline shows Scheduled step with green checkmark for BID_ACCEPTED jobs', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR059-10', 'Customer can initiate reschedule', 'Verify customer can also initiate reschedule requests', 'manual', 'P1', 'passed', false, false
    FROM product_features pf WHERE pf.feature_code = 'FR-059'
    ON CONFLICT (test_code) DO NOTHING;
  END IF;
END $$;
