export function createEmptyProgress() {
  return {
    completedChapterIds: [],
  };
}

export function normalizeProgress(progress) {
  if (!progress || !Array.isArray(progress.completedChapterIds)) {
    return createEmptyProgress();
  }

  return {
    completedChapterIds: Array.from(new Set(progress.completedChapterIds)).filter(
      (chapterId) => typeof chapterId === "string",
    ),
  };
}

export function toggleCompletedChapter(progress, chapterId, completed) {
  const normalized = normalizeProgress(progress);
  const completedChapterIds = new Set(normalized.completedChapterIds);

  if (completed) {
    completedChapterIds.add(chapterId);
  } else {
    completedChapterIds.delete(chapterId);
  }

  return normalizeProgress({ completedChapterIds: Array.from(completedChapterIds) });
}

export function toggleCompletedDay(progress, day, completed) {
  const normalized = normalizeProgress(progress);
  const completedChapterIds = new Set(normalized.completedChapterIds);

  for (const chapter of day.chapters) {
    if (completed) {
      completedChapterIds.add(chapter.id);
    } else {
      completedChapterIds.delete(chapter.id);
    }
  }

  return normalizeProgress({ completedChapterIds: Array.from(completedChapterIds) });
}

export function markThroughDate(progress, plan, isoDate) {
  const normalized = normalizeProgress(progress);
  const completedChapterIds = new Set(normalized.completedChapterIds);

  for (const day of plan) {
    if (day.date <= isoDate) {
      for (const chapter of day.chapters) {
        completedChapterIds.add(chapter.id);
      }
    }
  }

  return normalizeProgress({ completedChapterIds: Array.from(completedChapterIds) });
}

export function getDayChapterProgress(day, completedChapterIds) {
  const completed = new Set(completedChapterIds);
  const completedChapters = day.chapters.filter((chapter) => completed.has(chapter.id)).length;

  return {
    completedChapters,
    isComplete: completedChapters === day.chapterCount,
    isStarted: completedChapters > 0,
    totalChapters: day.chapterCount,
  };
}

export function getCompletedDayIds(plan, completedChapterIds) {
  const completed = new Set(completedChapterIds);

  return plan
    .filter((day) => day.chapters.every((chapter) => completed.has(chapter.id)))
    .map((day) => day.id);
}
