/**
 * Utility functions for formatting county/parish names
 */

/**
 * Get the appropriate suffix for a geographic region based on state
 * Louisiana uses "Parish" instead of "County"
 */
export function getCountySuffix(stateCode?: string | null): string {
  const normalizedState = (stateCode || '').trim().toUpperCase();
  return normalizedState === 'LA' ? 'Parish' : 'County';
}

/**
 * Format a county name with the appropriate suffix (County or Parish)
 * Handles cases where the name may already include a suffix
 *
 * @param name - The county/parish name (may or may not include suffix)
 * @param stateCode - The state code (e.g., 'LA', 'TX', etc.)
 * @returns Formatted name with appropriate suffix
 */
export function formatCountyName(name: string, stateCode?: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';

  const normalizedState = (stateCode || '').trim().toUpperCase();

  // Check if the name already has a county/parish suffix
  const hasCounty = /\bcounty\b/i.test(trimmed);
  const hasParish = /\bparish\b/i.test(trimmed);

  if (normalizedState === 'LA') {
    // Louisiana: use Parish
    if (hasParish && hasCounty) {
      // Has both (e.g., "Orleans Parish County"), remove County and keep Parish
      return trimmed.replace(/\s+county\b/i, '').replace(/\s+parish\b/i, ' Parish');
    }
    if (hasParish) {
      // Already has Parish, just ensure proper capitalization
      return trimmed.replace(/\s+parish\b/i, ' Parish');
    }
    if (hasCounty) {
      // Has County, replace with Parish
      return trimmed.replace(/\s+county\b/i, ' Parish');
    }
    // No suffix, add Parish
    return `${trimmed} Parish`;
  } else {
    // Other states: use County
    if (hasParish && hasCounty) {
      // Has both (shouldn't happen, but handle it), remove Parish and keep County
      return trimmed.replace(/\s+parish\b/i, '').replace(/\s+county\b/i, ' County');
    }
    if (hasCounty) {
      // Already has County, just ensure proper capitalization
      return trimmed.replace(/\s+county\b/i, ' County');
    }
    if (hasParish) {
      // Has Parish, replace with County
      return trimmed.replace(/\s+parish\b/i, ' County');
    }
    // No suffix, add County
    return `${trimmed} County`;
  }
}

/**
 * Remove county/parish suffix from a name
 * Useful for API queries that expect normalized names
 */
export function removeCountySuffix(name: string): string {
  return (name || '').trim().replace(/\s+(county|parish)\s*$/i, '').trim();
}
