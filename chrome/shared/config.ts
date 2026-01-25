// Shared configuration for the extension
// API base URL can only be configured by admin users

const DEFAULT_API_BASE_URL = 'https://fmr.fyi';

// Check if current user is admin
async function isAdmin(): Promise<boolean> {
  try {
    const { getCurrentUser } = await import('./auth');
    const user = await getCurrentUser();
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

export async function getApiBaseUrl(): Promise<string> {
  return new Promise(async (resolve) => {
    // Only allow custom base URL for admin users
    const admin = await isAdmin();
    if (!admin) {
      resolve(DEFAULT_API_BASE_URL);
      return;
    }
    
    chrome.storage.local.get(['api_base_url'], (items) => {
      resolve(items.api_base_url || DEFAULT_API_BASE_URL);
    });
  });
}

export async function setApiBaseUrl(url: string): Promise<void> {
  // Only allow setting custom base URL for admin users
  const admin = await isAdmin();
  if (!admin) {
    throw new Error('Only admin users can configure API base URL');
  }
  
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ api_base_url: url }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
