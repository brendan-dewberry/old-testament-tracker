export function createEmptyProgress() {
  return {
    completedDayIds: [],
  };
}

export function normalizeProgress(progress) {
  if (!progress || !Array.isArray(progress.completedDayIds)) {
    return createEmptyProgress();
  }

  return {
    completedDayIds: Array.from(new Set(progress.completedDayIds))
      .filter((dayId) => typeof dayId === "string")
      .sort(),
  };
}

export function mergeProgress(...progressValues) {
  const completedDayIds = new Set();

  for (const progress of progressValues) {
    for (const dayId of normalizeProgress(progress).completedDayIds) {
      completedDayIds.add(dayId);
    }
  }

  return normalizeProgress({ completedDayIds: Array.from(completedDayIds) });
}

export function toggleCompletedDay(progress, dayId, completed) {
  const normalized = normalizeProgress(progress);
  const completedDayIds = new Set(normalized.completedDayIds);

  if (completed) {
    completedDayIds.add(dayId);
  } else {
    completedDayIds.delete(dayId);
  }

  return normalizeProgress({ completedDayIds: Array.from(completedDayIds) });
}

export function markThroughDate(progress, plan, isoDate) {
  const normalized = normalizeProgress(progress);
  const completedDayIds = new Set(normalized.completedDayIds);

  for (const day of plan) {
    if (day.date <= isoDate) {
      completedDayIds.add(day.id);
    }
  }

  return normalizeProgress({ completedDayIds: Array.from(completedDayIds) });
}
