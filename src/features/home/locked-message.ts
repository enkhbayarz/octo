import { type Locale, localize, type Messages } from '@/i18n';
import type { LockReason } from '@/progress/selectors';

/** Words a lock reason as what to do next, in the learner's language. */
export function lockedMessage(t: Messages, reason: LockReason, locale: Locale): string {
  switch (reason.kind) {
    case 'quiz-needs-lessons':
      return t.locked.quizNeedsLessons;
    case 'previous-quiz':
      return t.locked.previousQuiz(reason.unitNumber);
    case 'previous-lesson':
      return t.locked.previousLesson(localize(reason.lesson.title, locale));
    case 'locked':
      return t.locked.generic;
  }
}
