import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progression, normalizeProgress, todayKey, activitySummary } from '../src/progression.js';
test('points follow XP and levels advance at exact 100 XP boundaries', () => {
  assert.deepEqual(progression(0), { xp: 0, points: 0, level: 1, xpInLevel: 0, xpToNextLevel: 100 });
  assert.equal(progression(99).level, 1); assert.equal(progression(99).xpToNextLevel, 1);
  assert.equal(progression(100).level, 2); assert.equal(progression(245).level, 3);
  assert.equal(progression(-1).xp, 0); assert.equal(progression(Infinity).xp, 0);
});
test('attendance and mission days deduplicate and use Korean midnight', () => {
  assert.equal(todayKey(new Date('2026-11-25T14:59:59Z')), '2026-11-25');
  assert.equal(todayKey(new Date('2026-11-25T15:00:00Z')), '2026-11-26');
  const state = normalizeProgress({ studyDates: ['2026-11-24', '2026-11-25', '2026-11-25'], attendanceDates: ['2026-11-26', '2026-11-26'] }, '2026-11-26');
  assert.equal(state.streak, 2); assert.equal(state.month, 2);
  assert.equal(state.attendanceStreak, 1); assert.equal(state.attendanceDates.length, 1);
  assert.equal(activitySummary(state.studyDates, '2026-11-26').today, false);
  assert.equal(activitySummary(state.attendanceDates, '2026-11-26').today, true);
});
test('missed days break streaks, month changes preserve history and daily missions reset', () => {
  assert.equal(activitySummary(['2026-11-24'], '2026-11-26').streak, 0);
  const state = normalizeProgress({ studyDates: ['2026-10-31', '2026-11-01', '2026-11-02'], quests: { lesson: true }, questDate: '2026-11-01' }, '2026-11-02');
  assert.equal(state.streak, 3); assert.equal(state.month, 2); assert.equal(state.studyDates.length, 3);
  assert.equal(state.quests.lesson, false);
  assert.equal(activitySummary(['invalid', '2026-02-30', '2027-01-01'], '2026-11-26').total, 0);
});
test('derived values cannot diverge and only valid progress fields are saved', () => {
  const data = normalizeProgress({ xp: 120, points: 999, level: 50, completed: -1, quests: { lesson: true, admin: true }, hasAccount: true });
  assert.equal(data.points, 120); assert.equal(data.level, 2); assert.equal(data.completed, 0);
  assert.deepEqual(data.quests, { lesson: true, review: false, speak: false });
  assert.equal(data.hasAccount, undefined);
});
