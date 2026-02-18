const VALID_TIERS = ['free', 'paid', 'free_forever'] as const;
export type DefaultSignupTier = (typeof VALID_TIERS)[number];

/**
 * Configurable default tier for new signups (env: DEFAULT_SIGNUP_TIER).
 * Defaults to 'free_forever' for early adopters; set to 'free' when moving to paid.
 */
export function getDefaultSignupTier(): DefaultSignupTier {
  const raw = process.env.DEFAULT_SIGNUP_TIER?.toLowerCase().trim() || 'free_forever';
  if (VALID_TIERS.includes(raw as DefaultSignupTier)) {
    return raw as DefaultSignupTier;
  }
  return 'free_forever';
}
