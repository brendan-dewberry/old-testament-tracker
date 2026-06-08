import assert from "node:assert/strict";
import test from "node:test";

import { buildReadingPlan } from "../../src/plan.js";
import {
  CLOUD_PLAN_ID,
  buildLegacyProgressPayload,
  buildProgressPayload,
  isSupabaseConfigured,
  normalizeCloudProgress,
} from "../../src/supabase-sync.js";

test("isSupabaseConfigured accepts only real-looking public Supabase config", () => {
  assert.equal(isSupabaseConfigured({ url: "", anonKey: "" }), false);
  assert.equal(
    isSupabaseConfigured({
      anonKey: "a".repeat(21),
      url: "https://example.supabase.co",
    }),
    true,
  );
  assert.equal(
    isSupabaseConfigured({
      anonKey: "a".repeat(21),
      url: "https://example.com",
    }),
    false,
  );
});

test("normalizeCloudProgress turns database rows into app progress", () => {
  const plan = buildReadingPlan();

  assert.deepEqual(
    normalizeCloudProgress(
      {
        completed_chapter_ids: ["Genesis 1", "bad", "Genesis 2", "Genesis 1"],
        translation: "NIV",
      },
      { plan },
    ),
    {
      progress: {
        completedChapterIds: ["Genesis 1", "Genesis 2"],
      },
      translation: "NIV",
    },
  );

  assert.deepEqual(normalizeCloudProgress(null, { plan }), {
    progress: {
      completedChapterIds: [],
    },
    translation: null,
  });
});

test("normalizeCloudProgress expands legacy completed day ids", () => {
  const plan = buildReadingPlan();

  assert.deepEqual(
    normalizeCloudProgress(
      {
        completed_day_ids: [plan[0].id],
        translation: "ESV",
      },
      { plan },
    ),
    {
      progress: {
        completedChapterIds: plan[0].chapters.map((chapter) => chapter.id),
      },
      translation: "ESV",
    },
  );
});

test("buildProgressPayload creates a row owned by the authenticated user", () => {
  const plan = buildReadingPlan();
  const payload = buildProgressPayload({
    plan,
    progress: {
      completedChapterIds: [
        ...plan[0].chapters.map((chapter) => chapter.id),
        plan[1].chapters[0].id,
      ],
    },
    translation: "ESV",
    userId: "2b0d2bfa-393b-4616-9ccd-3e110d1beb9a",
  });

  assert.equal(payload.plan_id, CLOUD_PLAN_ID);
  assert.equal(payload.user_id, "2b0d2bfa-393b-4616-9ccd-3e110d1beb9a");
  assert.deepEqual(payload.completed_chapter_ids, [
    ...plan[0].chapters.map((chapter) => chapter.id),
    plan[1].chapters[0].id,
  ]);
  assert.deepEqual(payload.completed_day_ids, [plan[0].id]);
  assert.equal(payload.translation, "ESV");
  assert.match(payload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildLegacyProgressPayload preserves chapter progress before the schema is migrated", () => {
  const payload = buildLegacyProgressPayload({
    progress: { completedChapterIds: ["Genesis 1"] },
    translation: "ESV",
    userId: "2b0d2bfa-393b-4616-9ccd-3e110d1beb9a",
  });

  assert.deepEqual(payload.completed_day_ids, ["Genesis 1"]);
  assert.equal(payload.completed_chapter_ids, undefined);
});
