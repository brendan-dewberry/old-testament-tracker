import { buildReadingPlan } from "./plan.js";
import { getCompletedDayIds, normalizeProgress } from "./progress.js";

export const CLOUD_PLAN_ID = "old-testament-2026";
export const LEGACY_PROGRESS_COLUMNS = "completed_day_ids, translation";
export const PROGRESS_TABLE = "old_testament_progress";
export const PROGRESS_COLUMNS = "completed_chapter_ids, completed_day_ids, translation";
export const SUPABASE_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.106.2/+esm";

export function isSupabaseConfigured(config) {
  return (
    typeof config?.url === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) &&
    typeof config?.anonKey === "string" &&
    config.anonKey.length > 20
  );
}

export async function createCloudProgressStore({
  config,
  createClient = loadSupabaseClient,
  plan = buildReadingPlan(),
}) {
  if (!isSupabaseConfigured(config)) {
    throw new Error("Supabase is not configured.");
  }

  const supabase = await createClient(config.url, config.anonKey);

  return {
    async getSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      return data.session;
    },

    onAuthStateChange(onChange) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        onChange(session);
      });

      return () => data.subscription.unsubscribe();
    },

    async signInWithEmail(email, redirectTo) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        throw error;
      }
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    },

    async loadProgress() {
      let { data, error } = await selectProgressRecord(supabase, PROGRESS_COLUMNS);

      if (error && isMissingCompletedChapterColumn(error)) {
        ({ data, error } = await selectProgressRecord(supabase, LEGACY_PROGRESS_COLUMNS));
      }

      if (error) {
        throw error;
      }

      return normalizeCloudProgress(data, { plan });
    },

    async saveProgress({ progress, translation, userId }) {
      const { error } = await supabase
        .from(PROGRESS_TABLE)
        .upsert(buildProgressPayload({ plan, progress, translation, userId }), {
          onConflict: "user_id,plan_id",
        });

      if (error && isMissingCompletedChapterColumn(error)) {
        const { error: legacyError } = await supabase
          .from(PROGRESS_TABLE)
          .upsert(buildLegacyProgressPayload({ progress, translation, userId }), {
            onConflict: "user_id,plan_id",
          });

        if (legacyError) {
          throw legacyError;
        }

        return;
      }

      if (error) {
        throw error;
      }
    },
  };
}

export function normalizeCloudProgress(record, { plan = buildReadingPlan() } = {}) {
  if (!record) {
    return {
      progress: normalizeProgress({ completedChapterIds: [] }),
      translation: null,
    };
  }

  return {
    progress: normalizeProgress({
      completedChapterIds: expandSavedProgressIds(
        [
          ...(Array.isArray(record.completed_chapter_ids) ? record.completed_chapter_ids : []),
          ...(Array.isArray(record.completed_day_ids) ? record.completed_day_ids : []),
        ],
        plan,
      ),
    }),
    translation: typeof record.translation === "string" ? record.translation : null,
  };
}

export function buildProgressPayload({ plan = buildReadingPlan(), progress, translation, userId }) {
  const normalized = normalizeProgress(progress);

  return {
    completed_chapter_ids: normalized.completedChapterIds,
    completed_day_ids: getCompletedDayIds(plan, normalized.completedChapterIds),
    plan_id: CLOUD_PLAN_ID,
    translation,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

export function buildLegacyProgressPayload({ progress, translation, userId }) {
  return {
    completed_day_ids: normalizeProgress(progress).completedChapterIds,
    plan_id: CLOUD_PLAN_ID,
    translation,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

async function selectProgressRecord(supabase, columns) {
  return supabase
    .from(PROGRESS_TABLE)
    .select(columns)
    .eq("plan_id", CLOUD_PLAN_ID)
    .maybeSingle();
}

function expandSavedProgressIds(savedIds, plan) {
  const chapterIds = new Set(plan.flatMap((day) => day.chapters.map((chapter) => chapter.id)));
  const chapterIdsByDayId = new Map(
    plan.map((day) => [day.id, day.chapters.map((chapter) => chapter.id)]),
  );
  const completedChapterIds = [];

  for (const savedId of savedIds) {
    if (typeof savedId !== "string") {
      continue;
    }

    if (chapterIds.has(savedId)) {
      completedChapterIds.push(savedId);
      continue;
    }

    const dayChapterIds = chapterIdsByDayId.get(savedId);

    if (dayChapterIds) {
      completedChapterIds.push(...dayChapterIds);
    }
  }

  return completedChapterIds;
}

function isMissingCompletedChapterColumn(error) {
  const message = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");

  return message.includes("completed_chapter_ids");
}

async function loadSupabaseClient(url, anonKey) {
  const { createClient } = await import(SUPABASE_CLIENT_URL);
  return createClient(url, anonKey);
}
