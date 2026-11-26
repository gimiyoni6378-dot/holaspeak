export function progression(value = 0) {
  const xp = Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10000000) : 0;
  return { xp, points: xp, level: Math.floor(xp / 100) + 1, xpInLevel: xp % 100, xpToNextLevel: 100 - xp % 100 };
}
export const todayKey = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const dayNumber = date => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dayNumber(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date; }
export function dateHistory(dates, today = todayKey()) { return [...new Set((Array.isArray(dates) ? dates : []).filter(date => validDate(date) && date <= today))].sort().slice(-10000); }
export function activitySummary(dates, today = todayKey()) {
  const history = dateHistory(dates, today), days = new Set(history.map(dayNumber)), current = dayNumber(today);
  let cursor = days.has(current) ? current : current - 1, streak = 0;
  while (days.has(cursor)) { streak++; cursor--; }
  const monday = current - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7);
  return { dates: history, total: history.length, streak, month: history.filter(date => date.startsWith(today.slice(0, 7))).length, week: history.filter(date => dayNumber(date) >= monday).length, today: days.has(current) };
}
export function normalizeProgress(input = {}, today = todayKey()) {
  const study = activitySummary(input.studyDates, today), attendance = activitySummary(input.attendanceDates, today);
  const output = { ...progression(input.xp), completed: 0, month: study.month, streak: study.streak, review: 0, studyDates: study.dates, attendanceDates: attendance.dates, attendanceStreak: attendance.streak, questDate: today, pronunciationDone: input.pronunciationDone === true, signupPromptSeen: input.signupPromptSeen === true, quests: {} };
  for (const key of ['completed', 'review']) output[key] = Number.isSafeInteger(input[key]) && input[key] >= 0 ? Math.min(input[key], 10000000) : 0;
  for (const key of ['lesson', 'review', 'speak']) output.quests[key] = (!input.questDate || input.questDate === today) && input.quests?.[key] === true;
  return output;
}
