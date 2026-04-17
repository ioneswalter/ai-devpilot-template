/**
 * Test case parsing, code generation, and deduplication helpers
 */

export interface ParsedTestCase {
  title: string;
  test_type: string;
  priority: string;
}

/**
 * Parse test cases text into structured test case objects
 * Supports prefixes like [e2e], [unit], [manual], [integration]
 */
export function parseTestCasesText(text: string): ParsedTestCase[] {
  if (!text.trim()) return [];

  return text
    .split(/[\n\r]+/)
    .map(line => line.trim())
    .filter(line => line.length > 5)
    .map(line => {
      const typeMatch = line.match(/^\[(\w+)\]\s*/i);
      let test_type = 'manual';
      let title = line;

      if (typeMatch) {
        const prefix = typeMatch[1].toLowerCase();
        title = line.replace(typeMatch[0], '').trim();

        if (['e2e', 'end-to-end', 'end2end'].includes(prefix)) {
          test_type = 'e2e';
        } else if (['unit', 'unittest'].includes(prefix)) {
          test_type = 'unit';
        } else if (['integration', 'int'].includes(prefix)) {
          test_type = 'integration';
        } else if (['manual', 'qa'].includes(prefix)) {
          test_type = 'manual';
        } else if (['accessibility', 'a11y'].includes(prefix)) {
          test_type = 'accessibility';
        }
      }

      title = title.replace(/^[-•*\d.)]+\s*/, '').trim();

      return { title, test_type, priority: 'medium' };
    })
    .filter(tc => tc.title.length > 0);
}

/**
 * Generate next available test case code for a specific feature
 * Format: TC-{feature_number}-{sequence} (e.g., TC-054-001 for FR-054)
 */
export function generateTestCaseCode(
  existingCodes: string[],
  featureCode: string,
): string {
  const featureNumMatch = featureCode.match(/(?:FR|J)-(\d+)/);
  const featureNum = featureNumMatch ? featureNumMatch[1] : '000';

  const prefix = `TC-${featureNum}-`;

  const featureTcNumbers = existingCodes
    .filter(c => c.startsWith(prefix))
    .map(c => {
      const match = c.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);

  const maxNumber = featureTcNumbers.length > 0
    ? Math.max(...featureTcNumbers)
    : 0;
  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
}

/** Normalize a test case title for comparison */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if two test case titles are duplicates */
function isDuplicateTitle(
  newTitle: string,
  existingTitle: string,
): boolean {
  const normalizedNew = normalizeTitle(newTitle);
  const normalizedExisting = normalizeTitle(existingTitle);

  if (normalizedNew === normalizedExisting) return true;

  if (
    normalizedNew.includes(normalizedExisting) ||
    normalizedExisting.includes(normalizedNew)
  ) {
    const lenDiff = Math.abs(normalizedNew.length - normalizedExisting.length);
    const maxLen = Math.max(normalizedNew.length, normalizedExisting.length);
    if (lenDiff / maxLen < 0.2) return true;
  }

  return false;
}

/**
 * Filter out duplicate test cases based on existing test cases
 */
export function filterDuplicateTestCases(
  newTestCases: ParsedTestCase[],
  existingTestCases: { title: string }[],
): { unique: ParsedTestCase[]; duplicates: string[] } {
  const unique: ParsedTestCase[] = [];
  const duplicates: string[] = [];

  for (const tc of newTestCases) {
    const isDupe = existingTestCases.some(existing =>
      isDuplicateTitle(tc.title, existing.title)
    );

    if (isDupe) {
      duplicates.push(tc.title);
    } else {
      const isDupeInUnique = unique.some(u =>
        isDuplicateTitle(tc.title, u.title)
      );
      if (!isDupeInUnique) {
        unique.push(tc);
      } else {
        duplicates.push(tc.title);
      }
    }
  }

  return { unique, duplicates };
}
