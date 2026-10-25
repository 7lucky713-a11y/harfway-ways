import test from 'node:test';
import assert from 'node:assert/strict';
import { nextReviewAt, scheduleReview, isReviewDue } from '../lib/english-review.js';

const now = new Date('2026-10-25T10:00:00.000Z');

test('new cards become due tomorrow', () => {
  assert.equal(nextReviewAt(1, now), '2026-10-26T10:00:00.000Z');
  assert.equal(isReviewDue({ nextReviewAt: nextReviewAt(1, now) }, now), false);
  assert.equal(isReviewDue({ nextReviewAt: nextReviewAt(1, now) }, new Date('2026-10-26T10:00:00.000Z')), true);
});

test('successful recall expands the gap', () => {
  assert.deepEqual(scheduleReview(0, true, now), { streak: 1, intervalDays: 3, nextReviewAt: '2026-10-28T10:00:00.000Z' });
  assert.equal(scheduleReview(1, true, now).intervalDays, 7);
  assert.equal(scheduleReview(2, true, now).intervalDays, 14);
  assert.equal(scheduleReview(5, true, now).intervalDays, 30);
});

test('forgotten cards return the next day', () => {
  assert.deepEqual(scheduleReview(4, false, now), { streak: 0, intervalDays: 1, nextReviewAt: '2026-10-26T10:00:00.000Z' });
  assert.equal(isReviewDue({ nextReviewAt: 'invalid' }, now), false);
});
