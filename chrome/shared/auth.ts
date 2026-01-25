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

// Get stored tokens
export async function getTokens(): Promise<ExtensionTokens | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (items) => {
      const tokens = items[STORAGE_KEY];
      if (!tokens) {
        resolve(null);
        return;
      }

      // Check if access token is expired
      const expiresAt = new Date(tokens.expiresAt);
      if (expiresAt < new Date()) {
        // Token expired, try to refresh
        refreshTokenIfNeeded(tokens.refreshToken)
          .then((newTokens) => resolve(newTokens))
          .catch(() => resolve(null));
        return;
      }

      resolve(tokens);
    });
  });
}

// Store tokens
async function storeTokens(tokens: ExtensionTokens): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: tokens }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// Clear tokens
export async function logout(): Promise<void> {
  const tokens = await getTokens();
  if (tokens?.refreshToken) {
    // Revoke refresh token on server
    try {
      const API_BASE_URL = await getApiBaseUrl();
      await fetch(`${API_BASE_URL}/api/auth/extension-token`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch (error) {
      // Ignore errors - still clear local storage
      console.error('Error revoking token:', error);
    }
  }

  return new Promise((resolve) => {
    chrome.storage.sync.remove([STORAGE_KEY], () => {
      resolve();
    });
  });
}

// Refresh access token if needed
export async function refreshTokenIfNeeded(refreshToken?: string): Promise<ExtensionTokens | null> {
  const tokens = await getTokens();
  
  if (!tokens && !refreshToken) {
    return null;
  }

  const tokenToUse = refreshToken || tokens?.refreshToken;
  if (!tokenToUse) {
    return null;
  }

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/api/auth/extension-token`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: tokenToUse }),
    });

    if (!response.ok) {
      // Refresh failed - clear tokens
      await logout();
      return null;
    }

    const data = await response.json();
    
    // Merge with existing tokens (keep refresh token and user info)
    const newTokens: ExtensionTokens = {
      accessToken: data.accessToken,
      refreshToken: tokens?.refreshToken || tokenToUse,
      expiresAt: tokens?.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      user: data.user || tokens?.user,
    };

    await storeTokens(newTokens);
    return newTokens;
  } catch (error) {
    console.error('Error refreshing token:', error);
    await logout();
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
  const API_BASE_URL = await getApiBaseUrl();
  
  return new Promise((resolve, reject) => {
    // Check if we're in a content script (chrome.tabs is undefined)
    // If so, send a message to the background service worker
    if (typeof chrome.tabs === 'undefined' || !chrome.tabs.create) {
      chrome.runtime.sendMessage(
        { type: 'OPEN_LOGIN_TAB', url: `${API_BASE_URL}/auth/extension` },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to open auth page'));
          }
        }
      );
      return;
    }
    
    // Use chrome.tabs.create for extension popups (window.open doesn't work)
    chrome.tabs.create({
      url: `${API_BASE_URL}/auth/extension`,
      active: true,
    }, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.id) {
        reject(new Error(chrome.runtime.lastError?.message || 'Failed to open auth page'));
        return;
      }
      
      // The background service worker will handle the auth success message
      // and store the tokens. Just resolve here - the popup will detect
      // auth state changes via storage listener.
      resolve();
    });
  });
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
