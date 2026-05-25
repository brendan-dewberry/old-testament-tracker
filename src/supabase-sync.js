import { normalizeProgress } from "./progress.js";

export const CLOUD_PLAN_ID = "old-testament-2026";
export const PROGRESS_TABLE = "old_testament_progress";
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

export async function createCloudProgressStore({ config, createClient = loadSupabaseClient }) {
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
      const { data, error } = await supabase
        .from(PROGRESS_TABLE)
        .select("completed_day_ids, translation")
        .eq("plan_id", CLOUD_PLAN_ID)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return normalizeCloudProgress(data);
    },

    async saveProgress({ progress, translation, userId }) {
      const { error } = await supabase
        .from(PROGRESS_TABLE)
        .upsert(buildProgressPayload({ progress, translation, userId }), {
          onConflict: "user_id,plan_id",
        });

      if (error) {
        throw error;
      }
    },
  };
}

export function normalizeCloudProgress(record) {
  if (!record) {
    return {
      progress: normalizeProgress({ completedDayIds: [] }),
      translation: null,
    };
  }

  return {
    progress: normalizeProgress({
      completedDayIds: Array.isArray(record.completed_day_ids)
        ? record.completed_day_ids
        : [],
    }),
    translation: typeof record.translation === "string" ? record.translation : null,
  };
}

export function buildProgressPayload({ progress, translation, userId }) {
  return {
    completed_day_ids: normalizeProgress(progress).completedDayIds,
    plan_id: CLOUD_PLAN_ID,
    translation,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
}

async function loadSupabaseClient(url, anonKey) {
  const { createClient } = await import(SUPABASE_CLIENT_URL);
  return createClient(url, anonKey);
}
