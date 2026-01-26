/**
 * Utility functions for scripts that need to make requests to the FMR API
 * These functions ensure scripts use a consistent guest_id to avoid inflating the guest list
 */

/**
 * Generate a consistent guest_id for scripts
 * Uses a fixed UUID that identifies all script requests
 */
const SCRIPT_GUEST_ID = '00000000-0000-4000-8000-000000000000'; // Fixed UUID v4 for scripts

/**
 * Get headers with guest_id cookie for script requests
 * This ensures all script requests use the same guest_id
 */
export function getScriptRequestHeaders(): HeadersInit {
  return {
    'Cookie': `guest_id=${SCRIPT_GUEST_ID}`,
    'User-Agent': 'fmr-search-script/1.0',
  };
}

/**
 * Make a fetch request with script guest_id cookie
 * Use this instead of fetch() when making requests from scripts
 */
export async function scriptFetch(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  
  // Add script guest_id cookie
  headers.set('Cookie', `guest_id=${SCRIPT_GUEST_ID}`);
  
  // Add User-Agent if not already set
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'fmr-search-script/1.0');
  }
  
  return fetch(url, {
    ...init,
    headers,
  });
}

/**
 * Get the script guest_id (useful for debugging)
 */
export function getScriptGuestId(): string {
  return SCRIPT_GUEST_ID;
}
