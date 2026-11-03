/**
 * State of one quiz attempt: pick → check → see feedback → next.
 * A reducer keeps every transition explicit and testable.
 */
import type { Question } from '@/course';

export type QuizSession = {
  index: number;
  selected: number | null;
  checked: boolean;
  /** The option picked for each checked question, in order. */
  choices: number[];
};

export type QuizAction = { type: 'select'; option: number } | { type: 'check' } | { type: 'next' };

export const initialQuizSession: QuizSession = {
  index: 0,
  selected: null,
  checked: false,
  choices: [],
};

export function quizSessionReducer(state: QuizSession, action: QuizAction): QuizSession {
  switch (action.type) {
    case 'select':
      return state.checked ? state : { ...state, selected: action.option };
    case 'check':
      if (state.checked || state.selected === null) return state;
      return { ...state, checked: true, choices: [...state.choices, state.selected] };
    case 'next':
      if (!state.checked) return state;
      return { ...state, index: state.index + 1, selected: null, checked: false };
  }
}

/** Leaving now would throw away answers the learner has given. */
export function hasUnsavedAnswers(state: QuizSession): boolean {
  return state.selected !== null || state.choices.length > 0;
}

/** Was each choice the right answer? */
export function scoreChoices(
  questions: readonly Question[],
  choices: readonly number[],
): boolean[] {
  return choices.map((choice, index) => choice === questions[index]?.answerIndex);
}

/** Choices travel to the result screen as a route param, one digit per question ("10212"). */
export function encodeChoices(choices: readonly number[]): string {
  return choices.join('');
}

/** Null unless there is exactly one valid option per question. */
export function decodeChoices(param: string, questions: readonly Question[]): number[] | null {
  if (param.length !== questions.length || !/^\d+$/.test(param)) return null;
  const choices = [...param].map(Number);
  const valid = choices.every((choice, index) => choice < (questions[index]?.options.length ?? 0));
  return valid ? choices : null;
}
