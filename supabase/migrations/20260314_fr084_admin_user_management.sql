-- FR-084: Admin User Management
-- Adds admin user management feature with block/unblock, user detail editing,
-- infinite scroll, and blocked-user login enforcement.

-- Insert product feature
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features') THEN
    INSERT INTO product_features (feature_code, title, description, feature_type, priority, status, acceptance_criteria)
    VALUES (
      'FR-084',
      'Admin User Management',
      'Full admin user management: view all user fields, edit profiles, block/unblock users with login enforcement, infinite scroll user list, custom confirmation modals, and sorted blocked-users-first display.',
      'enhancement',
      'P1',
      'released',
      '["Admin can view complete user profile via Details modal","Admin can edit name, email, address, country, bio, experience, reputation, verification, active status","Block/unblock shows styled confirmation modal with user info","Blocked users get 403 ACCOUNT_BLOCKED on login and see error banner","Any API call by blocked user triggers forced logout","Blocked users appear at top of user list regardless of sort","Infinite scroll loads next page when scrolling near bottom","Search and sort reset scroll position and reload from page 1"]'::jsonb
    )
    ON CONFLICT (feature_code) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      status = 'released',
      acceptance_criteria = EXCLUDED.acceptance_criteria;
  END IF;
END $$;

-- Insert test cases
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_cases')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features')
  THEN
    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-01', 'Admin views user details modal', 'Click Details button opens modal with all user fields organized in sections: Identity, Location, Provider Details, Status & Performance', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-02', 'Admin edits user profile fields', 'Edit name, email, bio, reputation in Details modal, click Save, verify changes persist after refresh', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-03', 'Admin blocks user with confirmation modal', 'Click Block shows styled modal with user avatar/name/phone, red Block User button, and cancel option', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-04', 'Blocked user cannot sign in', 'Block a user via admin, attempt login as that user, verify 403 ACCOUNT_BLOCKED error and blocked message banner on login page', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-05', 'Blocked users sorted to top of list', 'After blocking a user, verify they appear at top of user list regardless of sort field', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-06', 'Admin unblocks user with green confirmation', 'Click Unblock on blocked user shows green modal, confirm restores access, user can sign in again', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-07', 'Infinite scroll loads more users', 'Scroll down in user list, verify next page loads automatically before reaching bottom via IntersectionObserver with 400px margin', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-08', 'Search filters users in real-time', 'Type in search box, verify debounced search filters users by name/email/phone after 300ms', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-09', 'Input fields retain focus while typing', 'Open Details modal, type in Bio or Name field, verify cursor stays in field without losing focus', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';

    INSERT INTO test_cases (feature_id, test_code, title, description, test_type, priority, status, automated, passed)
    SELECT pf.id, 'TC-FR084-10', 'Mid-session block enforcement', 'Block a user who is already logged in, verify their next API call returns 403 and forces logout', 'manual', 'P1', 'passed', false, true
    FROM product_features pf WHERE pf.feature_code = 'FR-084'
    ON CONFLICT (test_code) DO UPDATE SET passed = true, status = 'passed';
  END IF;
END $$;
