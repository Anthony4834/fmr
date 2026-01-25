/**
 * Wrapper around fetch that automatically handles rate limiting
 * When a 429 response is received, it triggers the rate limit modal
 */
export async function apiFetch(
  url: string | URL,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, options);

  // Check for rate limit exceeded (429)
  if (response.status === 429) {
    const resetTimeHeader = response.headers.get('X-RateLimit-Reset');
    
    if (resetTimeHeader) {
      const resetTime = parseInt(resetTimeHeader, 10);
      
      // Dispatch custom event to trigger the rate limit modal
      // The RateLimitContext will listen for this event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('rate-limit-exceeded', {
            detail: { resetTime },
          })
        );
      }
    }
  }

  return response;
}

/**
 * Helper to parse JSON from apiFetch response
 * Throws if response is not ok (except 429 which is handled by modal)
 */
export async function apiFetchJson<T = any>(
  url: string | URL,
  options?: RequestInit
): Promise<T> {
  const response = await apiFetch(url, options);

  // If rate limited, throw a specific error that components can catch
  if (response.status === 429) {
    const error = new Error('Rate limit exceeded') as Error & { status: number };
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
