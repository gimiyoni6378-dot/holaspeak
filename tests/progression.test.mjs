import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progression, normalizeProgress } from '../src/progression.js';
test('points follow XP and levels advance at exact 100 XP boundaries', () => {
  assert.deepEqual(progression(0), { xp: 0, points: 0, level: 1, xpInLevel: 0, xpToNextLevel: 100 });
  assert.equal(progression(99).level, 1); assert.equal(progression(99).xpToNextLevel, 1);
  assert.equal(progression(100).level, 2); assert.equal(progression(245).level, 3);
  assert.equal(progression(-1).xp, 0); assert.equal(progression(Infinity).xp, 0);
});
test('derived values cannot diverge and only valid progress fields are saved', () => {
  const data = normalizeProgress({ xp: 120, points: 999, level: 50, completed: -1, quests: { lesson: true, admin: true }, hasAccount: true });
  assert.equal(data.points, 120); assert.equal(data.level, 2); assert.equal(data.completed, 0);
  assert.deepEqual(data.quests, { lesson: true, review: false, speak: false });
  assert.equal(data.hasAccount, undefined);
});
