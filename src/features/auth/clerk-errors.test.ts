import { describe, expect, test } from 'bun:test';

import { mn } from '@/i18n/mn';

import { authErrorMessage, clerkErrorCode, looksLikeEmail } from './clerk-errors';

const t = mn.auth;

describe('clerk errors', () => {
  test('reads the code from API errors and from runtime errors', () => {
    expect(clerkErrorCode({ errors: [{ code: 'form_code_incorrect' }] })).toBe(
      'form_code_incorrect',
    );
    expect(clerkErrorCode({ code: 'network_error' })).toBe('network_error');
    expect(clerkErrorCode(null)).toBeUndefined();
    expect(clerkErrorCode('boom')).toBeUndefined();
  });

  test('tells the learner what to do, in their language', () => {
    expect(authErrorMessage({ errors: [{ code: 'form_code_incorrect' }] }, t)).toBe(t.codeInvalid);
    expect(authErrorMessage({ errors: [{ code: 'verification_expired' }] }, t)).toBe(t.codeExpired);
    expect(authErrorMessage({ errors: [{ code: 'form_identifier_invalid' }] }, t)).toBe(
      t.emailInvalid,
    );
    expect(authErrorMessage({ code: 'network_error' }, t)).toBe(t.offline);
    expect(authErrorMessage(new Error('anything else'), t)).toBe(t.failed);
  });
});

describe('looksLikeEmail', () => {
  test('accepts ordinary addresses, rejects obvious typos', () => {
    expect(looksLikeEmail(' bold@example.mn ')).toBe(true);
    expect(looksLikeEmail('bold+clerk_test@example.com')).toBe(true);
    expect(looksLikeEmail('bold@example')).toBe(false);
    expect(looksLikeEmail('bold example.com')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
