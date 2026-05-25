import assert from "node:assert/strict";
import test from "node:test";

import { buildReadingPlan, summarizeProgress } from "../../src/plan.js";
import {
  createEmptyProgress,
  markThroughDate,
  mergeProgress,
  normalizeProgress,
  toggleCompletedDay,
} from "../../src/progress.js";

test("progress operations work against the generated reading plan", () => {
  const plan = buildReadingPlan();
  let progress = createEmptyProgress();

  progress = toggleCompletedDay(progress, plan[0].id, true);
  progress = toggleCompletedDay(progress, plan[1].id, true);
  progress = toggleCompletedDay(progress, plan[1].id, false);
  progress = markThroughDate(progress, plan, plan[4].date);

  const summary = summarizeProgress({
    completedDayIds: progress.completedDayIds,
    plan,
    todayIso: plan[4].date,
  });

  assert.deepEqual(progress.completedDayIds, [
    "2026-05-25",
    "2026-05-26",
    "2026-05-27",
    "2026-05-28",
    "2026-05-29",
  ]);
  assert.equal(summary.completedDays, 5);
  assert.equal(summary.overdueChapters, 0);
});

test("normalizeProgress ignores bad saved data while preserving valid day ids", () => {
  assert.deepEqual(
    normalizeProgress({
      completedDayIds: ["2026-05-26", 12, "2026-05-25", "2026-05-25", null],
    }),
    {
      completedDayIds: ["2026-05-25", "2026-05-26"],
    },
  );
});

test("mergeProgress keeps all completed local and cloud readings", () => {
  assert.deepEqual(
    mergeProgress(
      { completedDayIds: ["2026-05-25", "2026-05-27"] },
      { completedDayIds: ["2026-05-26", "2026-05-27"] },
    ),
    {
      completedDayIds: ["2026-05-25", "2026-05-26", "2026-05-27"],
    },
  );
});
