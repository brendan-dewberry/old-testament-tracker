import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_PLAN_ID,
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
  assert.deepEqual(
    normalizeCloudProgress({
      completed_day_ids: ["2026-05-26", "bad", "2026-05-25", "2026-05-25"],
      translation: "NIV",
    }),
    {
      progress: {
        completedDayIds: ["2026-05-25", "2026-05-26", "bad"],
      },
      translation: "NIV",
    },
  );

  assert.deepEqual(normalizeCloudProgress(null), {
    progress: {
      completedDayIds: [],
    },
    translation: null,
  });
});

test("buildProgressPayload creates a row owned by the authenticated user", () => {
  const payload = buildProgressPayload({
    progress: { completedDayIds: ["2026-05-25"] },
    translation: "ESV",
    userId: "2b0d2bfa-393b-4616-9ccd-3e110d1beb9a",
  });

  assert.equal(payload.plan_id, CLOUD_PLAN_ID);
  assert.equal(payload.user_id, "2b0d2bfa-393b-4616-9ccd-3e110d1beb9a");
  assert.deepEqual(payload.completed_day_ids, ["2026-05-25"]);
  assert.equal(payload.translation, "ESV");
  assert.match(payload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});
