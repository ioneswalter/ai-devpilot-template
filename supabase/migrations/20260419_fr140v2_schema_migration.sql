-- FR-140 v2.0 T001: Rename prototype_type 'process' to 'sequence'
-- Updates CHECK constraints and migrates existing data

-- 1. Update any existing 'process' rows to 'sequence'
UPDATE prototype_versions SET prototype_type = 'sequence' WHERE prototype_type = 'process';
UPDATE prototype_attachments SET prototype_type = 'sequence' WHERE prototype_type = 'process';

-- 2. Drop old CHECK constraints (inline constraints get auto-generated names)
ALTER TABLE prototype_versions DROP CONSTRAINT IF EXISTS prototype_versions_prototype_type_check;
ALTER TABLE prototype_attachments DROP CONSTRAINT IF EXISTS prototype_attachments_prototype_type_check;

-- 3. Add new CHECK constraints with 'sequence' instead of 'process'
ALTER TABLE prototype_versions ADD CONSTRAINT prototype_versions_prototype_type_check
  CHECK (prototype_type IN ('ui', 'flowchart', 'sequence'));

ALTER TABLE prototype_attachments ADD CONSTRAINT prototype_attachments_prototype_type_check
  CHECK (prototype_type IN ('ui', 'flowchart', 'sequence'));
