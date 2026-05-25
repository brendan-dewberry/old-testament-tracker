import { createEmptyProgress, normalizeProgress } from "./progress.js";

export const PROGRESS_STORAGE_KEY = "old-testament-tracker:progress:v1";
export const VERSION_STORAGE_KEY = "old-testament-tracker:translation:v1";

export function loadProgress(storage = window.localStorage) {
  try {
    const savedProgress = storage.getItem(PROGRESS_STORAGE_KEY);
    return savedProgress ? normalizeProgress(JSON.parse(savedProgress)) : createEmptyProgress();
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(progress, storage = window.localStorage) {
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(normalizeProgress(progress)));
}

export function loadTranslation(storage = window.localStorage) {
  try {
    return storage.getItem(VERSION_STORAGE_KEY) || "ESV";
  } catch {
    return "ESV";
  }
}

export function saveTranslation(version, storage = window.localStorage) {
  storage.setItem(VERSION_STORAGE_KEY, version);
}
