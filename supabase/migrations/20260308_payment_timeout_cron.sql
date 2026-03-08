-- Enable pg_cron extension (available on Supabase Pro plan)
-- This runs the payment timeout check every hour
-- If pg_cron is not available, the function can be called manually or via external scheduler

-- Uncomment the following lines if pg_cron is enabled on your Supabase project:

-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- SELECT cron.schedule(
--   'payment-timeout-check',
--   '0 * * * *',  -- Every hour
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/jobs-payment-timeout',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- Add CANCELLED status support for job_requests
-- (PostgreSQL doesn't enforce enum values for text columns, so no migration needed)

-- Add RLS policy for notifications DELETE (needed for clearAll feature)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own notifications'
  ) THEN
    CREATE POLICY "Users delete own notifications"
    ON notifications FOR DELETE
    TO authenticated
    USING (recipient_id = auth.uid());
  END IF;
END $$;
