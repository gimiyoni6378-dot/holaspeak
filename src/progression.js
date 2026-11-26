export function progression(value = 0) {
  const xp = Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10000000) : 0;
  return { xp, points: xp, level: Math.floor(xp / 100) + 1, xpInLevel: xp % 100, xpToNextLevel: 100 - xp % 100 };
}
export function normalizeProgress(input = {}) {
  const output = { ...progression(input.xp), completed: 0, month: 0, streak: 0, review: 0, pronunciationDone: input.pronunciationDone === true, signupPromptSeen: input.signupPromptSeen === true, quests: {} };
  for (const key of ['completed', 'month', 'streak', 'review']) output[key] = Number.isSafeInteger(input[key]) && input[key] >= 0 ? Math.min(input[key], 10000000) : 0;
  for (const key of ['lesson', 'review', 'speak']) output.quests[key] = input.quests?.[key] === true;
  return output;
}
