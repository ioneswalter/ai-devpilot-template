-- FR-020: Invoice and Tax Documentation Generation
-- Creates invoices table, sequence, storage bucket, and RLS policies

-- 1. Create invoice number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- 2. Create function to generate invoice numbers (INV-YYYY-NNNNN)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq_val INT;
  year_str TEXT;
BEGIN
  seq_val := nextval('invoice_number_seq');
  year_str := EXTRACT(YEAR FROM NOW())::TEXT;
  RETURN 'INV-' || year_str || '-' || LPAD(seq_val::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  invoice_number        TEXT NOT NULL UNIQUE,
  escrow_payment_id     TEXT UNIQUE REFERENCES escrow_payments(id),
  additional_escrow_id  TEXT UNIQUE REFERENCES additional_work_escrows(id),
  provider_id           TEXT NOT NULL REFERENCES service_providers(id),
  customer_id           TEXT NOT NULL REFERENCES customers(id),
  job_id                TEXT NOT NULL,
  service_cost          INT NOT NULL,
  platform_fee          INT NOT NULL,
  platform_fee_rate     TEXT NOT NULL,
  net_payout            INT NOT NULL,
  tax_amount            INT NOT NULL DEFAULT 0,
  currency_code         TEXT NOT NULL DEFAULT 'AUD',
  status                TEXT NOT NULL DEFAULT 'GENERATED',
  pdf_storage_path      TEXT,
  tax_year              INT NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_released_at   TIMESTAMPTZ NOT NULL,
  job_title             TEXT NOT NULL,
  service_category      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraint: exactly one payment reference must be set
  CONSTRAINT chk_invoice_payment_ref CHECK (
    (escrow_payment_id IS NOT NULL AND additional_escrow_id IS NULL) OR
    (escrow_payment_id IS NULL AND additional_escrow_id IS NOT NULL)
  )
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_invoices_provider_id ON invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tax_year ON invoices(tax_year);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON invoices(issued_at);

-- 5. Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Provider can read their own invoices
CREATE POLICY invoices_provider_select ON invoices
  FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()::TEXT
    )
  );

-- Admin can read all invoices
CREATE POLICY invoices_admin_select ON invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'user_role' = 'admin'
    )
  );

-- Service role can insert/update (Edge Functions only)
CREATE POLICY invoices_service_insert ON invoices
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY invoices_service_update ON invoices
  FOR UPDATE
  USING (true);

-- 7. Create private storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 8. Storage RLS policies
-- Provider can read their own invoices (path: invoices/{provider_id}/...)
CREATE POLICY invoices_storage_provider_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()::TEXT
    )
  );

-- Admin can read all invoice PDFs
CREATE POLICY invoices_storage_admin_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'user_role' = 'admin'
    )
  );

-- Service role can upload/delete PDFs
CREATE POLICY invoices_storage_service_insert ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY invoices_storage_service_update ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'invoices');

CREATE POLICY invoices_storage_service_delete ON storage.objects
  FOR DELETE
  USING (bucket_id = 'invoices');
