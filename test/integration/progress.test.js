import assert from "node:assert/strict";
import test from "node:test";

import { buildReadingPlan, summarizeProgress } from "../../src/plan.js";
import {
  createEmptyProgress,
  getDayChapterProgress,
  markThroughDate,
  normalizeProgress,
  toggleCompletedChapter,
  toggleCompletedDay,
} from "../../src/progress.js";

test("progress operations work against the generated reading plan", () => {
  const plan = buildReadingPlan();
  let progress = createEmptyProgress();

  progress = toggleCompletedChapter(progress, plan[0].chapters[0].id, true);

  assert.deepEqual(getDayChapterProgress(plan[0], progress.completedChapterIds), {
    completedChapters: 1,
    isComplete: false,
    isStarted: true,
    totalChapters: plan[0].chapterCount,
  });

  progress = toggleCompletedDay(progress, plan[1], true);
  progress = toggleCompletedDay(progress, plan[1], false);
  progress = markThroughDate(progress, plan, plan[4].date);

  const summary = summarizeProgress({
    completedChapterIds: progress.completedChapterIds,
    plan,
    todayIso: plan[4].date,
  });

  assert.deepEqual(
    progress.completedChapterIds,
    plan.slice(0, 5).flatMap((day) => day.chapters.map((chapter) => chapter.id)),
  );
  assert.equal(summary.completedDays, 5);
  assert.equal(summary.overdueChapters, 0);
});

test("normalizeProgress ignores bad saved data while preserving valid chapter ids", () => {
  assert.deepEqual(
    normalizeProgress({
      completedChapterIds: ["Genesis 2", 12, "Genesis 1", "Genesis 1", null],
    }),
    {
      completedChapterIds: ["Genesis 2", "Genesis 1"],
    },
  );
});
