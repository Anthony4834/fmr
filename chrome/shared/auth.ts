// Auth service for Chrome extension
// Handles login, token storage, refresh, and logout

import { getApiBaseUrl } from './config';

export interface ExtensionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    tier: string;
    role: string;
  };
}

const STORAGE_KEY = 'fmr_extension_auth';

function isContextInvalidated(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Extension context invalidated/i.test(msg) || /context invalidated/i.test(msg);
}

// Get stored tokens
export async function getTokens(): Promise<ExtensionTokens | null> {
  try {
    return await new Promise((resolve) => {
      try {
        chrome.storage.sync.get([STORAGE_KEY], (items) => {
          if (chrome.runtime?.lastError && isContextInvalidated(new Error(chrome.runtime.lastError.message))) {
            resolve(null);
            return;
          }
          const tokens = items?.[STORAGE_KEY];
          if (!tokens) {
            resolve(null);
            return;
          }
          const expiresAt = new Date(tokens.expiresAt);
          if (expiresAt < new Date()) {
            refreshTokenIfNeeded(tokens.refreshToken)
              .then((newTokens) => resolve(newTokens))
              .catch(() => resolve(null));
            return;
          }
          resolve(tokens);
        });
      } catch (e) {
        if (isContextInvalidated(e)) {
          resolve(null);
        } else {
          throw e;
        }
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) return null;
    throw e;
  }
}

// Store tokens
async function storeTokens(tokens: ExtensionTokens): Promise<void> {
  try {
    return await new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.set({ [STORAGE_KEY]: tokens }, () => {
          if (chrome.runtime?.lastError) {
            if (isContextInvalidated(new Error(chrome.runtime.lastError.message))) {
              resolve();
              return;
            }
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (e) {
        if (isContextInvalidated(e)) {
          resolve();
        } else {
          reject(e);
        }
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) return;
    throw e;
  }
}

// Clear tokens
export async function logout(): Promise<void> {
  try {
    const tokens = await getTokens();
    if (tokens?.refreshToken) {
      try {
        const API_BASE_URL = await getApiBaseUrl();
        await fetch(`${API_BASE_URL}/api/auth/extension-token`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch (error) {
        if (!isContextInvalidated(error)) console.error('Error revoking token:', error);
      }
    }
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.sync.remove([STORAGE_KEY], () => {
          if (chrome.runtime?.lastError && isContextInvalidated(new Error(chrome.runtime.lastError.message))) {
            resolve();
            return;
          }
          resolve();
        });
      } catch (e) {
        if (isContextInvalidated(e)) resolve();
        else reject(e);
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) return;
    throw e;
  }
}

// Refresh access token if needed
export async function refreshTokenIfNeeded(refreshToken?: string): Promise<ExtensionTokens | null> {
  let tokens: ExtensionTokens | null = null;
  try {
    tokens = await getTokens();
  } catch (e) {
    if (isContextInvalidated(e)) return null;
    throw e;
  }

  if (!tokens && !refreshToken) return null;
  const tokenToUse = refreshToken || tokens?.refreshToken;
  if (!tokenToUse) return null;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/api/auth/extension-token`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenToUse }),
    });

    if (!response.ok) {
      try {
        await logout();
      } catch {
        // ignore if logout fails (e.g. context invalidated)
      }
      return null;
    }

    const data = await response.json();
    const newTokens: ExtensionTokens = {
      accessToken: data.accessToken,
      refreshToken: tokens?.refreshToken || tokenToUse,
      expiresAt: tokens?.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      user: data.user || tokens?.user,
    };

    await storeTokens(newTokens);
    return newTokens;
  } catch (error) {
    if (isContextInvalidated(error)) return null;
    console.error('Error refreshing token:', error);
    try {
      await logout();
    } catch {
      // ignore
    }
    return null;
  }
}

// Get auth headers for API requests
export async function getAuthHeaders(): Promise<Record<string, string>> {
  let tokens = await getTokens();
  
  if (!tokens) {
    return {};
  }

  // Check if access token is expired or expiring soon (within 5 minutes)
  const expiresAt = new Date(tokens.expiresAt);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (expiresAt < fiveMinutesFromNow) {
    // Refresh token
    tokens = await refreshTokenIfNeeded();
    if (!tokens) {
      return {};
    }
  }

  return {
    Authorization: `Bearer ${tokens.accessToken}`,
  };
}

// Open login tab - authentication is handled by the background service worker
export async function login(): Promise<void> {
  try {
    const API_BASE_URL = await getApiBaseUrl();
    return await new Promise((resolve, reject) => {
      try {
        if (typeof chrome.tabs === 'undefined' || !chrome.tabs.create) {
          chrome.runtime.sendMessage(
            { type: 'OPEN_LOGIN_TAB', url: `${API_BASE_URL}/auth/extension` },
            (response) => {
              if (chrome.runtime?.lastError) {
                const err = new Error(chrome.runtime.lastError.message);
                if (isContextInvalidated(err)) {
                  reject(new Error('Extension was reloaded. Please refresh this page and try signing in again.'));
                  return;
                }
                reject(err);
                return;
              }
              if (response?.success) resolve();
              else reject(new Error(response?.error || 'Failed to open auth page'));
            }
          );
          return;
        }
        chrome.tabs.create({ url: `${API_BASE_URL}/auth/extension`, active: true }, (tab) => {
          if (chrome.runtime?.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            if (isContextInvalidated(err)) {
              reject(new Error('Extension was reloaded. Please refresh this page and try signing in again.'));
              return;
            }
            reject(err);
            return;
          }
          if (!tab?.id) {
            reject(new Error('Failed to open auth page'));
            return;
          }
          resolve();
        });
      } catch (e) {
        if (isContextInvalidated(e)) {
          reject(new Error('Extension was reloaded. Please refresh this page and try signing in again.'));
        } else {
          reject(e);
        }
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) {
      throw new Error('Extension was reloaded. Please refresh this page and try signing in again.');
    }
    throw e;
  }
}

// Check if user is logged in
export async function isLoggedIn(): Promise<boolean> {
  const tokens = await getTokens();
  return tokens !== null;
}

// Get current user info
export async function getCurrentUser(): Promise<ExtensionTokens['user'] | null> {
  const tokens = await getTokens();
  return tokens?.user || null;
}
