/**
 * Version suggestion utilities for release management
 * Provides semver parsing and increment logic for auto-suggesting next version numbers
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
  raw: string;
}

export interface VersionSuggestions {
  patch: string;
  minor: string;
  major: string;
}

/**
 * Parse a semantic version string into its components
 */
export function parseVersion(version: string): ParsedVersion | null {
  // Remove 'v' prefix if present
  const cleanVersion = version.replace(/^v/, '');
  
  // Regex for semver: major.minor.patch[-prerelease][+build]
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  
  const match = cleanVersion.match(semverRegex);
  if (!match) {
    return null;
  }
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
    raw: version,
  };
}

/**
 * Format a version object back to a string
 */
export function formatVersion(version: ParsedVersion, includePrefix = false): string {
  const prefix = includePrefix ? 'v' : '';
  let versionString = `${prefix}${version.major}.${version.minor}.${version.patch}`;
  
  if (version.prerelease) {
    versionString += `-${version.prerelease}`;
  }
  
  if (version.build) {
    versionString += `+${version.build}`;
  }
  
  return versionString;
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  // Compare major, minor, patch
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }
  
  // Handle prerelease versions
  if (a.prerelease && !b.prerelease) {
    return -1; // a is prerelease, b is not -> a < b
  }
  
  if (!a.prerelease && b.prerelease) {
    return 1; // a is not prerelease, b is -> a > b
  }
  
  if (a.prerelease && b.prerelease) {
    // Compare prerelease identifiers lexically
    return a.prerelease.localeCompare(b.prerelease);
  }
  
  // Both are equal
  return 0;
}

/**
 * Find the latest version from an array of version strings
 */
export function findLatestVersion(versions: string[]): string | null {
  if (versions.length === 0) {
    return null;
  }
  
  const parsedVersions = versions
    .map(v => parseVersion(v))
    .filter((v): v is ParsedVersion => v !== null)
    .filter(v => !v.prerelease); // Exclude prerelease versions
  
  if (parsedVersions.length === 0) {
    return null;
  }
  
  const latest = parsedVersions.reduce((latest, current) => 
    compareVersions(current, latest) > 0 ? current : latest
  );
  
  return latest.raw;
}

/**
 * Increment a version by the specified type
 */
export function incrementVersion(version: ParsedVersion, type: 'major' | 'minor' | 'patch'): ParsedVersion {
  const newVersion = { ...version };
  
  // Remove prerelease and build metadata when incrementing
  delete newVersion.prerelease;
  delete newVersion.build;
  
  switch (type) {
    case 'major':
      newVersion.major += 1;
      newVersion.minor = 0;
      newVersion.patch = 0;
      break;
    case 'minor':
      newVersion.minor += 1;
      newVersion.patch = 0;
      break;
    case 'patch':
      newVersion.patch += 1;
      break;
  }
  
  // Update raw string
  newVersion.raw = formatVersion(newVersion);
  
  return newVersion;
}

/**
 * Generate version suggestions based on existing releases
 */
export function generateVersionSuggestions(existingVersions: string[]): VersionSuggestions {
  const latestVersionString = findLatestVersion(existingVersions);
  
  // Default to 1.0.0 if no versions exist
  const baseVersion = latestVersionString 
    ? parseVersion(latestVersionString)
    : { major: 1, minor: 0, patch: 0, raw: '1.0.0' };
  
  if (!baseVersion) {
    // Fallback if parsing fails
    return {
      patch: '1.0.1',
      minor: '1.1.0',
      major: '2.0.0',
    };
  }
  
  const patchVersion = incrementVersion(baseVersion, 'patch');
  const minorVersion = incrementVersion(baseVersion, 'minor');
  const majorVersion = incrementVersion(baseVersion, 'major');
  
  return {
    patch: formatVersion(patchVersion),
    minor: formatVersion(minorVersion),
    major: formatVersion(majorVersion),
  };
}

/**
 * Validate if a version string is a valid semantic version
 */
export function isValidSemver(version: string): boolean {
  return parseVersion(version) !== null;
}

/**
 * Sort version strings in ascending order
 */
export function sortVersions(versions: string[]): string[] {
  return versions
    .map(v => ({ version: v, parsed: parseVersion(v) }))
    .filter(v => v.parsed !== null)
    .sort((a, b) => compareVersions(a.parsed!, b.parsed!))
    .map(v => v.version);
}

/**
 * Get the next suggested version based on feature impact
 */
export function suggestVersionByImpact(
  existingVersions: string[],
  impact: 'patch' | 'minor' | 'major' = 'minor'
): string {
  const suggestions = generateVersionSuggestions(existingVersions);
  return suggestions[impact];
}