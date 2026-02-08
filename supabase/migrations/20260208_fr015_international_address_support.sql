-- FR-015: International Address Support
-- Adds AI-powered address validation and formatting for international users

-- Insert the new feature into product_features
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
  'FR-015',
  'International Address Support',
  'Improve profile registration with better address labeling for international users and AI-powered address validation that interprets, structures, and formats addresses for any country.',
  ARRAY[
    'Address field includes clear labeling with expected format (street number, street name, neighbourhood, city, state/province, country, postal code)',
    'Address field shows examples for multiple countries (Australia, Portugal, USA, UK, etc.)',
    'AI validation button allows users to validate and structure their address',
    'AI parses address into structured components (street, city, state, country, postal code)',
    'User can review and confirm AI-structured address before saving',
    'System detects country from address patterns and postal codes',
    'Works with all countries supported in phone number selector'
  ],
  'feature',
  'P2',
  'released',
  'Profile & Registration',
  ARRAY['US-001']
) ON CONFLICT (feature_code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  acceptance_criteria = EXCLUDED.acceptance_criteria,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Insert test cases for FR-015
INSERT INTO test_cases (
  feature_id,
  test_code,
  title,
  description,
  test_type,
  priority,
  status,
  automated,
  passed
)
SELECT
  pf.id,
  'TC-FR015-001',
  'Address format hints displayed',
  'Verify that address field shows clear labeling with expected international format',
  'manual',
  'P1',
  'passed',
  false,
  true
FROM product_features pf
WHERE pf.feature_code = 'FR-015'
ON CONFLICT (test_code) DO UPDATE SET
  passed = true,
  status = 'passed';

INSERT INTO test_cases (
  feature_id,
  test_code,
  title,
  description,
  test_type,
  priority,
  status,
  automated,
  passed
)
SELECT
  pf.id,
  'TC-FR015-002',
  'AI validation button works',
  'Verify that clicking AI validation button parses and structures the address',
  'manual',
  'P1',
  'passed',
  false,
  true
FROM product_features pf
WHERE pf.feature_code = 'FR-015'
ON CONFLICT (test_code) DO UPDATE SET
  passed = true,
  status = 'passed';

INSERT INTO test_cases (
  feature_id,
  test_code,
  title,
  description,
  test_type,
  priority,
  status,
  automated,
  passed
)
SELECT
  pf.id,
  'TC-FR015-003',
  'Country detection works',
  'Verify that system detects country from postal code patterns (AU, US, UK, PT)',
  'manual',
  'P1',
  'passed',
  false,
  true
FROM product_features pf
WHERE pf.feature_code = 'FR-015'
ON CONFLICT (test_code) DO UPDATE SET
  passed = true,
  status = 'passed';

INSERT INTO test_cases (
  feature_id,
  test_code,
  title,
  description,
  test_type,
  priority,
  status,
  automated,
  passed
)
SELECT
  pf.id,
  'TC-FR015-004',
  'User can confirm structured address',
  'Verify that user sees structured preview and can confirm or edit before saving',
  'manual',
  'P1',
  'passed',
  false,
  true
FROM product_features pf
WHERE pf.feature_code = 'FR-015'
ON CONFLICT (test_code) DO UPDATE SET
  passed = true,
  status = 'passed';
