export const PLAN_START_DATE = "2026-05-25";
export const PLAN_END_DATE = "2026-12-31";

export const OLD_TESTAMENT_BOOKS = Object.freeze([
  { name: "Genesis", chapters: 50 },
  { name: "Exodus", chapters: 40 },
  { name: "Leviticus", chapters: 27 },
  { name: "Numbers", chapters: 36 },
  { name: "Deuteronomy", chapters: 34 },
  { name: "Joshua", chapters: 24 },
  { name: "Judges", chapters: 21 },
  { name: "Ruth", chapters: 4 },
  { name: "1 Samuel", chapters: 31 },
  { name: "2 Samuel", chapters: 24 },
  { name: "1 Kings", chapters: 22 },
  { name: "2 Kings", chapters: 25 },
  { name: "1 Chronicles", chapters: 29 },
  { name: "2 Chronicles", chapters: 36 },
  { name: "Ezra", chapters: 10 },
  { name: "Nehemiah", chapters: 13 },
  { name: "Esther", chapters: 10 },
  { name: "Job", chapters: 42 },
  { name: "Psalms", chapters: 150 },
  { name: "Proverbs", chapters: 31 },
  { name: "Ecclesiastes", chapters: 12 },
  { name: "Song of Solomon", chapters: 8 },
  { name: "Isaiah", chapters: 66 },
  { name: "Jeremiah", chapters: 52 },
  { name: "Lamentations", chapters: 5 },
  { name: "Ezekiel", chapters: 48 },
  { name: "Daniel", chapters: 12 },
  { name: "Hosea", chapters: 14 },
  { name: "Joel", chapters: 3 },
  { name: "Amos", chapters: 9 },
  { name: "Obadiah", chapters: 1 },
  { name: "Jonah", chapters: 4 },
  { name: "Micah", chapters: 7 },
  { name: "Nahum", chapters: 3 },
  { name: "Habakkuk", chapters: 3 },
  { name: "Zephaniah", chapters: 3 },
  { name: "Haggai", chapters: 2 },
  { name: "Zechariah", chapters: 14 },
  { name: "Malachi", chapters: 4 },
]);

export function buildReadingPlan({
  startDate = PLAN_START_DATE,
  endDate = PLAN_END_DATE,
  books = OLD_TESTAMENT_BOOKS,
} = {}) {
  const dates = getDateRange(startDate, endDate);
  const chapters = flattenChapters(books);

  if (dates.length === 0) {
    throw new Error("Reading plan must include at least one day.");
  }

  if (chapters.length === 0) {
    throw new Error("Reading plan must include at least one chapter.");
  }

  let cursor = 0;

  return dates.map((date, index) => {
    const nextCursor = Math.round(((index + 1) * chapters.length) / dates.length);
    const dailyChapters = chapters.slice(cursor, nextCursor);
    cursor = nextCursor;

    return {
      id: date,
      date,
      dayNumber: index + 1,
      readings: groupReadings(dailyChapters),
      chapterCount: dailyChapters.length,
    };
  });
}

export function summarizeProgress({ plan, completedDayIds, todayIso }) {
  const completed = new Set(completedDayIds);
  const totalChapters = sumChapters(plan);
  const completedChapters = sumChapters(plan.filter((day) => completed.has(day.id)));
  const scheduledBeforeToday = sumChapters(plan.filter((day) => day.date < todayIso));
  const scheduledChapters = sumChapters(plan.filter((day) => day.date <= todayIso));
  const dueChapters = Math.max(0, scheduledChapters - completedChapters);
  const overdueChapters = Math.max(0, scheduledBeforeToday - completedChapters);
  const completedDays = plan.filter((day) => completed.has(day.id)).length;

  return {
    completedChapters,
    completedDays,
    dueChapters,
    isOnTrack: overdueChapters === 0,
    overdueChapters,
    percentComplete: totalChapters === 0 ? 0 : completedChapters / totalChapters,
    remainingChapters: Math.max(0, totalChapters - completedChapters),
    scheduledBeforeToday,
    scheduledChapters,
    totalChapters,
    totalDays: plan.length,
  };
}

export function formatReading(readings) {
  return readings.map(formatReadingRange).join("; ");
}

export function formatReadingForSearch(readings) {
  return readings
    .map((reading) => {
      const chapterText =
        reading.startChapter === reading.endChapter
          ? String(reading.startChapter)
          : `${reading.startChapter}-${reading.endChapter}`;

      return `${reading.book} ${chapterText}`;
    })
    .join("; ");
}

export function getLocalTodayIso(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function flattenChapters(books = OLD_TESTAMENT_BOOKS) {
  return books.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, index) => ({
      book: book.name,
      chapter: index + 1,
    })),
  );
}

function groupReadings(chapters) {
  return chapters.reduce((readings, chapter) => {
    const previous = readings.at(-1);

    if (
      previous &&
      previous.book === chapter.book &&
      previous.endChapter + 1 === chapter.chapter
    ) {
      previous.endChapter = chapter.chapter;
      return readings;
    }

    readings.push({
      book: chapter.book,
      startChapter: chapter.chapter,
      endChapter: chapter.chapter,
    });

    return readings;
  }, []);
}

function formatReadingRange(reading) {
  if (reading.startChapter === reading.endChapter) {
    return `${reading.book} ${reading.startChapter}`;
  }

  return `${reading.book} ${reading.startChapter}-${reading.endChapter}`;
}

function getDateRange(startIso, endIso) {
  const startDate = parseIsoDate(startIso);
  const endDate = parseIsoDate(endIso);

  if (endDate < startDate) {
    throw new Error("Plan end date must be on or after the start date.");
  }

  const dates = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(formatIsoDate(current));
    current = addUtcDays(current, 1);
  }

  return dates;
}

function parseIsoDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatIsoDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addUtcDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function sumChapters(planDays) {
  return planDays.reduce((sum, day) => sum + day.chapterCount, 0);
}
