import { describe, expect, test } from 'bun:test';

import { course, pathItems } from '@/course';
import { createProgress } from '@/progress/rules';
import type { Progress } from '@/progress/types';

import type { ServerProfile, ServerProgress } from './api';
import { applyServer, planUpload } from './merge';

const emptyServer: ServerProgress = {
  xp: 0,
  streak: { count: 0, lastActiveDay: null },
  completedLessons: [],
  quizResults: {},
  videoProgress: {},
  activity: [],
};
const newProfile: ServerProfile = {
  id: 'u',
  displayName: null,
  email: 'a@b.c',
  timezone: 'Asia/Ulaanbaatar',
  onboarding: null,
  xp: 0,
  streak: 0,
};

function guest(changes: Partial<Progress>): Progress {
  return { ...createProgress('2026-11-04'), ...changes };
}

let keys = 0;
const nextKey = () => `key-${++keys}`;

describe('planUpload', () => {
  test('a fresh account gets the guest name, answers and progress, in path order', () => {
    const answers = course.units[0]!.quiz.questions.map((question) => question.answerIndex);
    const local = guest({
      learnerName: 'Болд',
      answers: { reason: 'travel', level: 'new', dailyMinutes: 10 },
      completedLessons: {
        'u1-l2': true,
        'u1-l1': true,
        'u1-l3': true,
        'u1-l4': true,
        'u1-l5': true,
        'u2-l1': true,
      },
      quizResults: { 'u1-quiz': { best: 5, total: 5, passed: true, attempts: 2 } },
    });
    const ops = planUpload(local, emptyServer, newProfile, pathItems, 'Asia/Ulaanbaatar', nextKey);
    expect(ops).toEqual([
      {
        kind: 'profile',
        displayName: 'Болд',
        onboarding: { reason: 'travel', level: 'new', dailyMinutes: 10 },
      },
      { kind: 'lesson', lessonId: 'u1-l1' },
      { kind: 'lesson', lessonId: 'u1-l2' },
      { kind: 'lesson', lessonId: 'u1-l3' },
      { kind: 'lesson', lessonId: 'u1-l4' },
      { kind: 'lesson', lessonId: 'u1-l5' },
      { kind: 'quiz', quizId: 'u1-quiz', answers, key: expect.stringMatching(/^key-/) },
      { kind: 'lesson', lessonId: 'u2-l1' },
    ]);
  });

  test('skips what the account already has and never overwrites its profile', () => {
    const local = guest({
      learnerName: 'Guest',
      completedLessons: { 'u1-l1': true, 'u1-l2': true },
    });
    const server = { ...emptyServer, completedLessons: ['u1-l1'] };
    const profile = { ...newProfile, displayName: 'Account name', timezone: 'Europe/Berlin' };
    expect(planUpload(local, server, profile, pathItems, 'Asia/Ulaanbaatar', nextKey)).toEqual([
      { kind: 'profile', timezone: 'Asia/Ulaanbaatar' },
      { kind: 'lesson', lessonId: 'u1-l2' },
    ]);
  });

  test('nothing to do for an empty guest on a matching account', () => {
    expect(
      planUpload(guest({}), emptyServer, newProfile, pathItems, 'Asia/Ulaanbaatar', nextKey),
    ).toEqual([]);
  });

  test('failed guest quiz attempts are not replayed', () => {
    const local = guest({
      quizResults: { 'u1-quiz': { best: 1, total: 5, passed: false, attempts: 1 } },
    });
    expect(
      planUpload(local, emptyServer, newProfile, pathItems, 'Asia/Ulaanbaatar', nextKey),
    ).toEqual([]);
  });
});

describe('applyServer', () => {
  const server: ServerProgress = {
    xp: 70,
    streak: { count: 3, lastActiveDay: '2026-11-04' },
    completedLessons: ['u1-l1', 'u1-l2'],
    quizResults: { 'u1-quiz': { best: 4, total: 5, passed: true, attempts: 1 } },
    videoProgress: {
      'u1-l3': { positionSec: 4, furthestSec: 9 },
      'u1-l4': { positionSec: 2, furthestSec: 2 },
    },
    activity: [
      { day: '2026-11-03', xp: 0 },
      { day: '2026-11-04', xp: 70 },
    ],
  };

  test('totals, streak, quiz results and name come from the account', () => {
    const merged = applyServer(guest({ learnerName: 'Local', xp: 10 }), server, {
      ...newProfile,
      displayName: 'Server',
      onboarding: { reason: 'work', level: 'basic', dailyMinutes: 20 },
    });
    expect(merged).toMatchObject({
      learnerName: 'Server',
      answers: { reason: 'work', level: 'basic', dailyMinutes: 20 },
      xp: 70,
      streak: { count: 3, lastActiveDay: '2026-11-04' },
      quizResults: { 'u1-quiz': { passed: true } },
    });
  });

  test('keeps local completions the server hasn’t received yet', () => {
    const merged = applyServer(guest({ completedLessons: { 'u1-l3': true } }), server, newProfile);
    expect(Object.keys(merged.completedLessons).sort()).toEqual(['u1-l1', 'u1-l2', 'u1-l3']);
  });

  test('video: resume where this phone left off, furthest is the max, finished lessons drop out', () => {
    const local = guest({
      completedLessons: { 'u1-l4': true },
      videoProgress: {
        'u1-l3': { position: 1, furthest: 6 },
        'u1-l4': { position: 2, furthest: 2 },
      },
    });
    expect(applyServer(local, server, newProfile).videoProgress).toEqual({
      'u1-l3': { position: 1, furthest: 9 },
    });
  });

  test('the server’s week replaces local days in that window; older days stay', () => {
    const local = guest({ activity: { '2026-10-01': 30, '2026-11-03': 10 } });
    expect(applyServer(local, server, newProfile).activity).toEqual({
      '2026-10-01': 30,
      '2026-11-03': 0,
      '2026-11-04': 70,
    });
  });

  test('keeps the local name when the account has none yet', () => {
    expect(applyServer(guest({ learnerName: 'Болд' }), server, newProfile).learnerName).toBe(
      'Болд',
    );
  });
});
