/**
 * Progress rules, kept identical to the mobile app's `src/progress/rules.ts`
 * so offline progress and server progress agree. Pure functions: "today" is
 * passed in, so every rule is unit-tested without a database.
 */
import { addDays, type DayKey } from '../../lib/dates.js';
import type { CourseTree, LessonDto, QuizDto } from '../course/course.schemas.js';

export const XP_PER_LESSON = 10;
/** Awarded for a quiz's first pass only, so retakes can't farm points. */
export const XP_PER_QUIZ_PASS = 20;

export type Streak = { count: number; lastDay: DayKey | null };

/** Any learning on a new day extends the streak if yesterday was active, else restarts it. */
export function advanceStreak(
  streak: Streak,
  today: DayKey,
): { streak: Streak; increased: boolean } {
  // Same day, or an earlier one after a time-zone change: nothing to add.
  if (streak.lastDay !== null && today <= streak.lastDay) return { streak, increased: false };
  const count = streak.lastDay === addDays(today, -1) ? streak.count + 1 : 1;
  return { streak: { count, lastDay: today }, increased: true };
}

/** The streak shown to the learner: it lapses once a whole day passes without activity. */
export function currentStreak(streak: Streak, today: DayKey): number {
  if (streak.lastDay === null) return 0;
  return streak.lastDay >= addDays(today, -1) ? streak.count : 0;
}

export function isPassingScore(correct: number, total: number, passPercent: number): boolean {
  return total > 0 && (correct / total) * 100 >= passPercent;
}

export function gradeQuiz(questions: { answerIndex: number }[], answers: readonly number[]) {
  const correct = questions.filter(
    (question, index) => answers[index] === question.answerIndex,
  ).length;
  return { correct, total: questions.length };
}

export type PathItem = { kind: 'lesson' | 'quiz'; id: string };
export type Done = { lessons: ReadonlySet<string>; passedQuizzes: ReadonlySet<string> };

/** Lessons and quizzes in one ordered list: each unit's lessons, then its quiz. */
export function buildPath(course: CourseTree): PathItem[] {
  return course.units.flatMap((unit): PathItem[] => [
    ...unit.lessons.map((lesson) => ({ kind: 'lesson' as const, id: lesson.id })),
    ...(unit.quiz ? [{ kind: 'quiz' as const, id: unit.quiz.id }] : []),
  ]);
}

function isDone(item: PathItem, done: Done) {
  return item.kind === 'lesson' ? done.lessons.has(item.id) : done.passedQuizzes.has(item.id);
}

/** An item opens once the item before it is done; the first item is always open. */
export function isUnlocked(path: PathItem[], id: string, done: Done): boolean {
  const index = path.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const previous = path[index - 1];
  return !previous || isDone(previous, done);
}

export function findLesson(course: CourseTree, lessonId: string): LessonDto | undefined {
  return course.units.flatMap((unit) => unit.lessons).find((lesson) => lesson.id === lessonId);
}

export function findQuiz(course: CourseTree, quizId: string): QuizDto | undefined {
  return course.units.map((unit) => unit.quiz).find((quiz) => quiz?.id === quizId) ?? undefined;
}
