/**
 * Public build-time settings from `.env` (Expo inlines `EXPO_PUBLIC_*`).
 * Both are optional so tests and forks still run: without them the app is
 * guest-only, exactly as before accounts existed.
 */
export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** Accounts and sync are available. */
export const accountsEnabled = clerkPublishableKey.length > 0 && apiUrl.length > 0;
