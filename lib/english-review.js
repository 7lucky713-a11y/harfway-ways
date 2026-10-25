const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

export function nextReviewAt(days, now = new Date()) {
  const start = new Date(now);
  if (!Number.isFinite(start.getTime())) throw new Error('invalid_review_date');
  return new Date(start.getTime() + days * DAY_MS).toISOString();
}

export function scheduleReview(previousStreak, remembered, now = new Date()) {
  const streak = remembered ? Math.min(5, Math.max(0, Number(previousStreak) || 0) + 1) : 0;
  const intervalDays = remembered ? REVIEW_INTERVALS[Math.min(streak, REVIEW_INTERVALS.length - 1)] : 1;
  return { streak, intervalDays, nextReviewAt: nextReviewAt(intervalDays, now) };
}

export function isReviewDue(card, now = new Date()) {
  const due = Date.parse(card?.nextReviewAt || '');
  return Number.isFinite(due) && due <= new Date(now).getTime();
}
