import assert from "node:assert/strict";
import test from "node:test";

import {
  OLD_TESTAMENT_BOOKS,
  buildReadingPlan,
  flattenChapters,
  formatReading,
  getLocalTodayIso,
  summarizeProgress,
} from "../../src/plan.js";

test("buildReadingPlan covers the full Old Testament between the target dates", () => {
  const plan = buildReadingPlan();

  assert.equal(plan.length, 221);
  assert.equal(plan[0].date, "2026-05-25");
  assert.equal(plan.at(-1).date, "2026-12-31");
  assert.equal(sumChapters(plan), 929);
  assert.equal(flattenChapters(OLD_TESTAMENT_BOOKS).length, 929);
  assert.deepEqual(plan[0].chapters, [
    { id: "Genesis 1", book: "Genesis", chapter: 1 },
    { id: "Genesis 2", book: "Genesis", chapter: 2 },
    { id: "Genesis 3", book: "Genesis", chapter: 3 },
    { id: "Genesis 4", book: "Genesis", chapter: 4 },
  ]);
  assert.deepEqual(plan[0].readings, [
    { book: "Genesis", startChapter: 1, endChapter: 4 },
  ]);
  assert.deepEqual(plan.at(-1).readings, [
    { book: "Malachi", startChapter: 1, endChapter: 4 },
  ]);
});

test("buildReadingPlan distributes readings without unusually large daily loads", () => {
  const plan = buildReadingPlan();
  const dailyChapterCounts = new Set(plan.map((day) => day.chapterCount));

  assert.deepEqual(Array.from(dailyChapterCounts).sort((a, b) => a - b), [4, 5]);
});

test("formatReading joins passages across book boundaries", () => {
  assert.equal(
    formatReading([
      { book: "Genesis", startChapter: 49, endChapter: 50 },
      { book: "Exodus", startChapter: 1, endChapter: 2 },
    ]),
    "Genesis 49-50; Exodus 1-2",
  );
});

test("summarizeProgress reports chapters, days, and pace", () => {
  const plan = buildReadingPlan();
  const summary = summarizeProgress({
    completedChapterIds: [
      ...plan[0].chapters.map((chapter) => chapter.id),
      plan[1].chapters[0].id,
      plan[1].chapters[1].id,
    ],
    plan,
    todayIso: plan[1].date,
  });

  assert.equal(summary.completedDays, 1);
  assert.equal(summary.completedChapters, plan[0].chapterCount + 2);
  assert.equal(summary.totalChapters, 929);
  assert.equal(summary.dueChapters, plan[1].chapterCount - 2);
  assert.equal(summary.isOnTrack, true);
});

test("summarizeProgress treats today's unread chapters as due, not overdue", () => {
  const plan = buildReadingPlan();
  const summary = summarizeProgress({
    completedChapterIds: [],
    plan,
    todayIso: plan[0].date,
  });

  assert.equal(summary.dueChapters, 4);
  assert.equal(summary.overdueChapters, 0);
  assert.equal(summary.isOnTrack, true);
});

test("getLocalTodayIso formats a local calendar date", () => {
  assert.equal(getLocalTodayIso(new Date(2026, 4, 25, 12)), "2026-05-25");
});

function sumChapters(plan) {
  return plan.reduce((sum, day) => sum + day.chapterCount, 0);
}
