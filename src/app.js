import {
  PLAN_END_DATE,
  PLAN_START_DATE,
  buildReadingPlan,
  formatReading,
  formatReadingForSearch,
  getLocalTodayIso,
  summarizeProgress,
} from "./plan.js";
import { markThroughDate, toggleCompletedDay } from "./progress.js";
import {
  loadProgress,
  loadTranslation,
  saveProgress,
  saveTranslation,
} from "./storage.js";
import { SUPABASE_CONFIG } from "./supabase-config.js";
import {
  createCloudProgressStore,
  isSupabaseConfigured,
  mergeCloudProgress,
} from "./supabase-sync.js";

const TRANSLATIONS = ["ESV", "NIV", "KJV", "NKJV", "NLT", "NASB", "CSB"];

export function main({ root = document.querySelector("#app") } = {}) {
  const state = {
    cloudStore: null,
    filter: "all",
    plan: buildReadingPlan(),
    progress: loadProgress(),
    query: "",
    sync: createSyncState(SUPABASE_CONFIG),
    todayIso: getLocalTodayIso(),
    translation: loadTranslation(),
  };

  bindEvents(root, state);
  render(root, state);
  void initializeCloudSync(root, state);
}

function bindEvents(root, state) {
  root.addEventListener("change", (event) => {
    const target = event.target;

    if (target.matches("[data-day-checkbox]")) {
      state.progress = toggleCompletedDay(state.progress, target.value, target.checked);
      persistProgress(root, state);
      return;
    }

    if (target.matches("[data-filter]")) {
      state.filter = target.value;
      render(root, state);
      return;
    }

    if (target.matches("[data-translation]")) {
      state.translation = target.value;
      saveTranslation(state.translation);
      render(root, state);
      void saveCloudSnapshot(root, state);
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target.matches("[data-search]")) {
      state.query = target.value;
      render(root, state);
      return;
    }

    if (target.matches("[data-sync-email]")) {
      state.sync.email = target.value;
    }
  });

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");

    if (!action) {
      return;
    }

    if (action.dataset.action === "mark-through-today") {
      state.progress = markThroughDate(state.progress, state.plan, state.todayIso);
      persistProgress(root, state);
      return;
    }

    if (action.dataset.action === "reset") {
      state.progress = { completedDayIds: [] };
      persistProgress(root, state);
      return;
    }

    if (action.dataset.action === "print") {
      window.print();
      return;
    }

    if (action.dataset.action === "sign-in") {
      void signInWithEmail(root, state);
      return;
    }

    if (action.dataset.action === "sign-out") {
      void signOut(root, state);
      return;
    }

    if (action.dataset.action === "sync-now") {
      void syncFromCloud(root, state);
    }
  });
}

async function initializeCloudSync(root, state) {
  if (!state.sync.configured) {
    return;
  }

  setSyncState(root, state, {
    message: "Connecting to Supabase...",
    status: "connecting",
  });

  try {
    state.cloudStore = await createCloudProgressStore({ config: SUPABASE_CONFIG });
    state.sync.unsubscribe = state.cloudStore.onAuthStateChange((session) => {
      void applyCloudSession(root, state, session);
    });
    await applyCloudSession(root, state, await state.cloudStore.getSession());
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      status: "error",
    });
  }
}

async function applyCloudSession(root, state, session) {
  state.sync.session = session;
  state.sync.userEmail = session?.user?.email ?? "";

  if (!session) {
    setSyncState(root, state, {
      message: "Sign in to sync progress across devices.",
      status: "signed-out",
    });
    return;
  }

  await syncFromCloud(root, state);
}

async function syncFromCloud(root, state) {
  if (!state.cloudStore || !state.sync.session) {
    return;
  }

  setSyncState(root, state, {
    message: "Syncing progress...",
    status: "syncing",
  });

  try {
    const remote = await state.cloudStore.loadProgress();
    state.progress = mergeCloudProgress({
      localProgress: state.progress,
      remoteProgress: remote.progress,
    });

    if (remote.translation && state.translation === "ESV") {
      state.translation = remote.translation;
      saveTranslation(state.translation);
    }

    saveProgress(state.progress);
    await saveCloudSnapshot(root, state, { renderSyncingState: false });
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      status: "error",
    });
  }
}

async function signInWithEmail(root, state) {
  if (!state.cloudStore) {
    return;
  }

  const email = state.sync.email.trim();

  if (!email.includes("@")) {
    setSyncState(root, state, {
      message: "Enter an email address first.",
      status: "signed-out",
    });
    return;
  }

  setSyncState(root, state, {
    message: "Sending magic link...",
    status: "signing-in",
  });

  try {
    await state.cloudStore.signInWithEmail(email, window.location.href);
    setSyncState(root, state, {
      email,
      message: "Check your email for the sign-in link.",
      status: "link-sent",
    });
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      status: "error",
    });
  }
}

async function signOut(root, state) {
  if (!state.cloudStore) {
    return;
  }

  setSyncState(root, state, {
    message: "Signing out...",
    status: "syncing",
  });

  try {
    await state.cloudStore.signOut();
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      status: "error",
    });
  }
}

function persistProgress(root, state) {
  saveProgress(state.progress);
  render(root, state);
  void saveCloudSnapshot(root, state);
}

async function saveCloudSnapshot(root, state, { renderSyncingState = true } = {}) {
  if (!state.cloudStore || !state.sync.session) {
    return;
  }

  if (renderSyncingState) {
    setSyncState(root, state, {
      message: "Saving progress...",
      status: "syncing",
    });
  }

  try {
    await state.cloudStore.saveProgress({
      progress: state.progress,
      translation: state.translation,
      userId: state.sync.session.user.id,
    });
    setSyncState(root, state, {
      message: `Synced ${formatClockTime(new Date())}`,
      status: "synced",
    });
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      status: "error",
    });
  }
}

function createSyncState(config) {
  const configured = isSupabaseConfigured(config);

  return {
    configured,
    email: "",
    message: configured
      ? "Connecting to Supabase..."
      : "Local only until Supabase is configured.",
    session: null,
    status: configured ? "connecting" : "local",
    unsubscribe: null,
    userEmail: "",
  };
}

function setSyncState(root, state, patch) {
  state.sync = {
    ...state.sync,
    ...patch,
  };
  render(root, state);
}

function render(root, state) {
  const summary = summarizeProgress({
    completedDayIds: state.progress.completedDayIds,
    plan: state.plan,
    todayIso: state.todayIso,
  });
  const completedDayIds = new Set(state.progress.completedDayIds);
  const currentDay = findCurrentDay(state.plan, state.todayIso);
  const visibleDays = getVisibleDays({
    completedDayIds,
    filter: state.filter,
    plan: state.plan,
    query: state.query,
  });

  root.innerHTML = `
    ${renderHeader(state)}
    <section class="overview" aria-label="Reading progress">
      ${renderProgressPanel(summary)}
      ${renderTodayPanel({ completedDayIds, currentDay, state })}
    </section>
    ${renderSyncPanel(state)}
    ${renderSchedule({ completedDayIds, state, visibleDays })}
  `;
}

function renderHeader(state) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Old Testament plan</p>
        <h1>Old Testament Tracker</h1>
        <p class="target">${formatFullDate(PLAN_START_DATE)} to ${formatFullDate(PLAN_END_DATE)}</p>
      </div>
      <div class="top-actions" aria-label="Plan actions">
        <select data-translation aria-label="Bible translation">
          ${TRANSLATIONS.map(
            (translation) =>
              `<option value="${translation}" ${
                translation === state.translation ? "selected" : ""
              }>${translation}</option>`,
          ).join("")}
        </select>
        <button class="primary" data-action="mark-through-today" type="button">Mark through today</button>
        <button data-action="print" type="button">Print</button>
        <button class="danger" data-action="reset" type="button">Reset</button>
      </div>
    </header>
  `;
}

function renderProgressPanel(summary) {
  const percent = summary.percentComplete * 100;
  const percentLabel = formatPercent(percent);
  const statusText = getStatusText(summary);

  return `
    <section class="panel progress-panel">
      <div class="progress-heading">
        <h2>Progress</h2>
        <div class="progress-percent">${percentLabel}</div>
      </div>
      <div class="progress-track" aria-label="${percentLabel} complete">
        <div class="progress-bar" style="width: ${percent}%"></div>
      </div>
      <dl class="stats">
        ${renderStat("Completed", `${summary.completedChapters} / ${summary.totalChapters}`)}
        ${renderStat("Remaining", `${summary.remainingChapters}`)}
        ${renderStat("Days", `${summary.completedDays} / ${summary.totalDays}`)}
        ${renderStat("Status", statusText)}
      </dl>
    </section>
  `;
}

function formatPercent(percent) {
  if (percent === 0 || percent >= 10) {
    return `${Math.round(percent)}%`;
  }

  return `${Math.round(percent * 10) / 10}%`;
}

function getStatusText(summary) {
  if (summary.overdueChapters > 0) {
    return `${summary.overdueChapters} chapters behind pace`;
  }

  if (summary.dueChapters > 0) {
    return `${summary.dueChapters} chapters due today`;
  }

  return "On track";
}

function renderTodayPanel({ completedDayIds, currentDay, state }) {
  const isComplete = completedDayIds.has(currentDay.id);
  const statusClass = isComplete ? "" : "warning";
  const statusText = isComplete ? "Complete" : "Open";
  const dateLabel = formatFullDate(currentDay.date);

  return `
    <section class="panel today-panel">
      <div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      <div>
        <h2>Today</h2>
        <p class="meta">Day ${currentDay.dayNumber} of ${state.plan.length} - ${dateLabel}</p>
      </div>
      <p class="reading">${escapeHtml(formatReading(currentDay.readings))}</p>
      <div class="day-actions">
        <label>
          <input
            data-day-checkbox
            type="checkbox"
            value="${currentDay.id}"
            ${isComplete ? "checked" : ""}
          >
          Mark complete
        </label>
        <a href="${readingUrl(currentDay.readings, state.translation)}" target="_blank" rel="noreferrer">Open in BibleGateway</a>
      </div>
    </section>
  `;
}

function renderSyncPanel(state) {
  if (!state.sync.configured) {
    return `
      <section class="panel sync-panel" aria-label="Cloud sync">
        <div>
          <h2>Sync</h2>
          <p class="meta">Local only</p>
        </div>
        <span class="status-pill warning">Supabase not configured</span>
      </section>
    `;
  }

  if (state.sync.session) {
    return `
      <section class="panel sync-panel" aria-label="Cloud sync">
        <div>
          <h2>Sync</h2>
          <p class="meta">${escapeHtml(state.sync.userEmail)} - ${escapeHtml(
            state.sync.message,
          )}</p>
        </div>
        <div class="sync-actions">
          <span class="status-pill ${state.sync.status === "error" ? "warning" : ""}">${escapeHtml(
            getSyncLabel(state.sync.status),
          )}</span>
          <button data-action="sync-now" type="button">Sync now</button>
          <button data-action="sign-out" type="button">Sign out</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel sync-panel" aria-label="Cloud sync">
      <div>
        <h2>Sync</h2>
        <p class="meta">${escapeHtml(state.sync.message)}</p>
      </div>
      <div class="sync-actions">
        <input
          data-sync-email
          type="email"
          placeholder="Email address"
          value="${escapeHtml(state.sync.email)}"
          aria-label="Email address"
        >
        <button class="primary" data-action="sign-in" type="button">Send link</button>
      </div>
    </section>
  `;
}

function renderSchedule({ completedDayIds, state, visibleDays }) {
  const rows =
    visibleDays.length > 0
      ? visibleDays
          .map((day) =>
            renderScheduleRow({
              completedDayIds,
              day,
              isToday: day.date === state.todayIso,
              translation: state.translation,
            }),
          )
          .join("")
      : `<div class="empty-state">No readings match that view.</div>`;

  return `
    <section class="panel schedule" aria-label="Reading schedule">
      <div class="schedule-header">
        <h2>Schedule</h2>
        <div class="schedule-tools">
          <input data-search type="search" placeholder="Search books or dates" value="${escapeHtml(
            state.query,
          )}" aria-label="Search schedule">
          <select data-filter aria-label="Filter schedule">
            <option value="all" ${state.filter === "all" ? "selected" : ""}>All readings</option>
            <option value="remaining" ${state.filter === "remaining" ? "selected" : ""}>Remaining</option>
            <option value="complete" ${state.filter === "complete" ? "selected" : ""}>Complete</option>
          </select>
        </div>
      </div>
      <div class="schedule-list">
        ${rows}
      </div>
    </section>
  `;
}

function renderScheduleRow({ completedDayIds, day, isToday, translation }) {
  const isComplete = completedDayIds.has(day.id);
  const className = ["schedule-row", isComplete ? "is-complete" : "", isToday ? "is-today" : ""]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${className}">
      <input
        id="day-${day.dayNumber}"
        data-day-checkbox
        type="checkbox"
        value="${day.id}"
        ${isComplete ? "checked" : ""}
        aria-label="Mark ${formatFullDate(day.date)} complete"
      >
      <div class="date-block">
        <strong>${formatShortDate(day.date)}</strong>
        <span>Day ${day.dayNumber}</span>
      </div>
      <div class="reading-block">
        <strong>${escapeHtml(formatReading(day.readings))}</strong>
        <span>${day.chapterCount} chapters</span>
      </div>
      <a class="row-link" href="${readingUrl(day.readings, translation)}" target="_blank" rel="noreferrer">Read</a>
    </article>
  `;
}

function renderStat(label, value) {
  return `
    <div class="stat">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function getSyncLabel(status) {
  const labels = {
    connecting: "Connecting",
    error: "Needs attention",
    "link-sent": "Link sent",
    local: "Local only",
    "signed-out": "Signed out",
    "signing-in": "Sending",
    synced: "Synced",
    syncing: "Syncing",
  };

  return labels[status] ?? "Sync";
}

function getVisibleDays({ completedDayIds, filter, plan, query }) {
  const normalizedQuery = query.trim().toLowerCase();

  return plan.filter((day) => {
    const isComplete = completedDayIds.has(day.id);
    const reading = formatReading(day.readings).toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      reading.includes(normalizedQuery) ||
      day.date.includes(normalizedQuery);
    const matchesFilter =
      filter === "all" ||
      (filter === "remaining" && !isComplete) ||
      (filter === "complete" && isComplete);

    return matchesQuery && matchesFilter;
  });
}

function findCurrentDay(plan, todayIso) {
  if (todayIso <= plan[0].date) {
    return plan[0];
  }

  const finalDay = plan.at(-1);

  if (todayIso >= finalDay.date) {
    return finalDay;
  }

  return plan.find((day) => day.date === todayIso) ?? plan[0];
}

function readingUrl(readings, translation) {
  const search = encodeURIComponent(formatReadingForSearch(readings));
  return `https://www.biblegateway.com/passage/?search=${search}&version=${encodeURIComponent(
    translation,
  )}`;
}

function formatFullDate(isoDate) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseLocalIsoDate(isoDate));
}

function formatShortDate(isoDate) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parseLocalIsoDate(isoDate));
}

function formatClockTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseLocalIsoDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (typeof document !== "undefined") {
  main();
}
