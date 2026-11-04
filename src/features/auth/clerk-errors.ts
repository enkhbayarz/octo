import type { Messages } from '@/i18n/mn';

/** Clerk's machine-readable error code, from either API errors or runtime errors. */
export function clerkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const first = (error as { errors?: { code?: string }[] }).errors?.[0]?.code;
  return first ?? (error as { code?: string }).code;
}

/** What to tell the learner, in their language. Unknown codes get a generic message. */
export function authErrorMessage(error: unknown, t: Messages['auth']): string {
  switch (clerkErrorCode(error)) {
    case 'form_identifier_invalid':
    case 'form_param_format_invalid':
    case 'form_param_nil':
      return t.emailInvalid;
    case 'form_code_incorrect':
    case 'verification_failed':
      return t.codeInvalid;
    case 'verification_expired':
      return t.codeExpired;
    case 'network_error':
      return t.offline;
    default:
      return t.failed;
  }
}

/** Light check before calling Clerk; Clerk validates properly. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
