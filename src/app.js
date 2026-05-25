import {
  PLAN_END_DATE,
  PLAN_START_DATE,
  buildReadingPlan,
  formatReading,
  formatReadingForSearch,
  getLocalTodayIso,
  summarizeProgress,
} from "./plan.js";
import { createEmptyProgress, markThroughDate, toggleCompletedDay } from "./progress.js";
import { SUPABASE_CONFIG } from "./supabase-config.js";
import { createCloudProgressStore, isSupabaseConfigured } from "./supabase-sync.js";

const TRANSLATIONS = ["ESV", "NIV", "KJV", "NKJV", "NLT", "NASB", "CSB"];
const DEFAULT_TRANSLATION = "ESV";

export function main({ root = document.querySelector("#app") } = {}) {
  const state = {
    cloudStore: null,
    filter: "all",
    plan: buildReadingPlan(),
    progress: createEmptyProgress(),
    query: "",
    sync: createSyncState(SUPABASE_CONFIG),
    todayIso: getLocalTodayIso(),
    translation: DEFAULT_TRANSLATION,
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

    if (target.matches("[data-translation]")) {
      state.translation = target.value;
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

    if (action.dataset.filterValue) {
      state.filter = action.dataset.filterValue;
      render(root, state);
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
    state.progress = createEmptyProgress();
    state.translation = DEFAULT_TRANSLATION;
    setSyncState(root, state, {
      message: "Sign in to save progress in Supabase.",
      progressLoaded: false,
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
    message: "Loading progress...",
    status: "syncing",
  });

  try {
    const remote = await state.cloudStore.loadProgress();
    state.progress = remote.progress;
    state.translation = remote.translation ?? DEFAULT_TRANSLATION;
    await saveCloudSnapshot(root, state, { renderSyncingState: false });
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      progressLoaded: false,
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
    await state.cloudStore.signInWithEmail(email, getAuthRedirectUrl(window.location));
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
  if (!state.sync.session) {
    render(root, state);
    return;
  }

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
      message: `Saved ${formatClockTime(new Date())}`,
      progressLoaded: true,
      status: "synced",
    });
  } catch (error) {
    setSyncState(root, state, {
      message: error.message,
      progressLoaded: true,
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
      : "Supabase must be configured before this tracker can save progress.",
    progressLoaded: false,
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
  if (!canUseTracker(state)) {
    root.innerHTML = `
      ${renderHeader(state)}
      ${renderAuthGate(state)}
    `;
    return;
  }

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
    <section class="workspace" aria-label="Reading tracker">
      <aside class="workspace-sidebar">
      ${renderTodayPanel({ completedDayIds, currentDay, state })}
        ${renderProgressPanel(summary)}
      </aside>
      ${renderSchedule({ completedDayIds, state, visibleDays })}
    </section>
  `;
}

function renderHeader(state) {
  const actions = canUseTracker(state)
    ? `
        <div class="top-actions" aria-label="Plan actions">
          ${renderAccountSummary(state)}
          <div class="toolbar-row">
            <select class="select-control" data-translation aria-label="Bible translation">
              ${TRANSLATIONS.map(
                (translation) =>
                  `<option value="${translation}" ${
                    translation === state.translation ? "selected" : ""
                  }>${translation}</option>`,
              ).join("")}
            </select>
            <button class="button primary" data-action="mark-through-today" type="button">Mark through today</button>
            <button class="button secondary" data-action="print" type="button">Print</button>
            <button class="button destructive" data-action="reset" type="button">Reset</button>
          </div>
        </div>
      `
    : "";

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Old Testament plan</p>
        <h1>Old Testament Tracker</h1>
        <p class="target">${formatFullDate(PLAN_START_DATE)} to ${formatFullDate(PLAN_END_DATE)}</p>
      </div>
      ${actions}
    </header>
  `;
}

function renderAccountSummary(state) {
  return `
    <section class="account-summary" aria-label="Account">
      <div>
        <span class="account-label">Account</span>
        <p>${escapeHtml(state.sync.userEmail)}</p>
      </div>
      <span class="status-pill ${state.sync.status === "error" ? "warning" : ""}">${escapeHtml(
        getSyncLabel(state.sync.status),
      )}</span>
      <button class="button ghost" data-action="sign-out" type="button">Sign out</button>
    </section>
  `;
}

function renderAuthGate(state) {
  if (!state.sync.configured) {
    return `
      <section class="panel auth-panel" aria-label="Sign in required">
        <span class="status-pill warning">Setup required</span>
        <h2>Sign In Required</h2>
        <p class="meta">${escapeHtml(state.sync.message)}</p>
        ${renderAuthMetrics(state)}
      </section>
    `;
  }

  if (state.sync.session && !state.sync.progressLoaded) {
    return `
      <section class="panel auth-panel" aria-label="Loading progress">
        <span class="status-pill">Connected</span>
        <h2>Loading Progress</h2>
        <p class="meta">${escapeHtml(state.sync.message)}</p>
        <div class="sync-actions">
          <button class="button secondary" data-action="sign-out" type="button">Sign out</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel auth-panel" aria-label="Sign in required">
      <span class="status-pill warning">${escapeHtml(getSyncLabel(state.sync.status))}</span>
      <h2>Sign In Required</h2>
      <p class="meta">${escapeHtml(state.sync.message)}</p>
      ${renderAuthMetrics(state)}
      <div class="sync-actions">
        <input
          class="input-control"
          data-sync-email
          type="email"
          placeholder="Email address"
          value="${escapeHtml(state.sync.email)}"
          aria-label="Email address"
        >
        <button class="button primary" data-action="sign-in" type="button">Send link</button>
      </div>
    </section>
  `;
}

function renderAuthMetrics(state) {
  const chapterCount = state.plan.reduce((sum, day) => sum + day.chapterCount, 0);

  return `
    <dl class="auth-metrics" aria-label="Plan summary">
      ${renderMetric("Days", state.plan.length)}
      ${renderMetric("Chapters", chapterCount)}
      ${renderMetric("Finish", formatShortDate(PLAN_END_DATE))}
    </dl>
  `;
}

function renderMetric(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
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
          <input class="input-control" data-search type="search" placeholder="Search books or dates" value="${escapeHtml(
            state.query,
          )}" aria-label="Search schedule">
          ${renderFilterSegments(state.filter)}
        </div>
      </div>
      <div class="schedule-list">
        ${rows}
      </div>
    </section>
  `;
}

function renderFilterSegments(activeFilter) {
  const options = [
    ["all", "All"],
    ["remaining", "Open"],
    ["complete", "Done"],
  ];

  return `
    <div class="segmented-control" role="group" aria-label="Filter schedule">
      ${options
        .map(
          ([value, label]) => `
            <button
              class="segment-button ${activeFilter === value ? "is-active" : ""}"
              data-filter-value="${value}"
              type="button"
              aria-pressed="${activeFilter === value}"
            >
              ${label}
            </button>
          `,
        )
        .join("")}
    </div>
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
    local: "Unavailable",
    "signed-out": "Signed out",
    "signing-in": "Sending",
    synced: "Saved",
    syncing: "Saving",
  };

  return labels[status] ?? "Sync";
}

function canUseTracker(state) {
  return Boolean(state.sync.session && state.sync.progressLoaded);
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

function getAuthRedirectUrl(location) {
  return `${location.origin}${location.pathname}`;
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
