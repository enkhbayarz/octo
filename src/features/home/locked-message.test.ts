import { describe, expect, mock, test } from 'bun:test';

import { findPathItem } from '@/course';

// '@/i18n' reads the phone language through a native module bun can't load.
mock.module('expo-localization', () => ({ getLocales: () => [{}], useLocales: () => [{}] }));
mock.module('@/settings/store', () => ({ useSettings: { getState: () => ({}) } }));

const { messagesFor } = await import('@/i18n');
const { lockedMessage } = await import('./locked-message');

const t = messagesFor('mn');
const greetings = findPathItem('u1-l1');

describe('lockedMessage', () => {
  test('words every lock reason as what to do next', () => {
    expect(lockedMessage(t, { kind: 'quiz-needs-lessons' }, 'mn')).toBe(t.locked.quizNeedsLessons);
    expect(lockedMessage(t, { kind: 'previous-quiz', unitNumber: 1 }, 'mn')).toBe(
      t.locked.previousQuiz(1),
    );
    expect(lockedMessage(t, { kind: 'locked' }, 'mn')).toBe(t.locked.generic);
  });

  test('names the previous lesson in the learner’s language', () => {
    if (greetings?.kind !== 'lesson') throw new Error('u1-l1 should be a lesson');
    const reason = { kind: 'previous-lesson', lesson: greetings.lesson } as const;
    expect(lockedMessage(t, reason, 'mn')).toBe('Өмнөх хичээлээ дуусгана уу: “Мэндчилгээ”');
    expect(lockedMessage(messagesFor('en'), reason, 'en')).toContain('Greetings');
  });
});
