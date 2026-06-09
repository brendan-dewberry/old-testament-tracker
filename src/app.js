import {
  PLAN_END_DATE,
  PLAN_START_DATE,
  buildReadingPlan,
  formatReading,
  formatReadingForSearch,
  getLocalTodayIso,
  summarizeProgress,
} from "./plan.js";
import {
  createEmptyProgress,
  getDayChapterProgress,
  markThroughDate,
  toggleCompletedChapter,
  toggleCompletedDay,
} from "./progress.js";
import { SUPABASE_CONFIG } from "./supabase-config.js";
import { createCloudProgressStore, isSupabaseConfigured } from "./supabase-sync.js";
import { captureViewportState, restoreViewportState } from "./viewport.js";

const TRANSLATIONS = ["ESV", "NIV", "KJV", "NKJV", "NLT", "NASB", "CSB"];
const DEFAULT_TRANSLATION = "ESV";

export function main({ root = document.querySelector("#app") } = {}) {
  const state = {
    cloudStore: null,
    filter: "all",
    expandedDayId: null,
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

    if (target.matches("[data-chapter-checkbox]")) {
      state.progress = toggleCompletedChapter(state.progress, target.value, target.checked);
      persistProgress(root, state);
      return;
    }

    if (target.matches("[data-day-checkbox]")) {
      const day = findDayById(state.plan, target.value);

      if (day) {
        state.progress = toggleCompletedDay(state.progress, day, target.checked);
      }

      persistProgress(root, state);
      return;
    }

    if (target.matches("[data-translation]")) {
      state.translation = target.value;
      renderPreservingViewport(root, state);
      void saveCloudSnapshot(root, state);
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target.matches("[data-search]")) {
      state.query = target.value;
      renderPreservingViewport(root, state);
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
      state.progress = createEmptyProgress();
      persistProgress(root, state);
      return;
    }

    if (action.dataset.action === "print") {
      window.print();
      return;
    }

    if (action.dataset.action === "toggle-day-details") {
      state.expandedDayId =
        state.expandedDayId === action.dataset.dayId ? null : action.dataset.dayId;
      renderPreservingViewport(root, state);
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
      renderPreservingViewport(root, state);
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
    state.cloudStore = await createCloudProgressStore({
      config: SUPABASE_CONFIG,
      plan: state.plan,
    });
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
    renderPreservingViewport(root, state);
    return;
  }

  renderPreservingViewport(root, state);
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
  renderPreservingViewport(root, state);
}

function renderPreservingViewport(root, state) {
  const viewportState = captureViewportState({ root });
  render(root, state);
  restoreViewportState(viewportState, { root });
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
    completedChapterIds: state.progress.completedChapterIds,
    plan: state.plan,
    todayIso: state.todayIso,
  });
  const completedChapterIds = new Set(state.progress.completedChapterIds);
  const currentDay = findCurrentDay(state.plan, state.todayIso);
  const visibleDays = getVisibleDays({
    completedChapterIds,
    filter: state.filter,
    plan: state.plan,
    query: state.query,
  });

  root.innerHTML = `
    ${renderHeader(state)}
    <section class="workspace" aria-label="Reading tracker">
      <aside class="workspace-sidebar">
      ${renderTodayPanel({ completedChapterIds, currentDay, state })}
        ${renderProgressPanel(summary)}
      </aside>
      ${renderSchedule({ completedChapterIds, state, visibleDays })}
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

function renderTodayPanel({ completedChapterIds, currentDay, state }) {
  const progress = getDayChapterProgress(currentDay, completedChapterIds);
  const statusClass = progress.isComplete ? "" : "warning";
  const statusText = getDayStatusText(progress);
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
      ${renderChapterChecklist({
        completedChapterIds,
        day: currentDay,
        idPrefix: "today",
      })}
      <div class="day-actions">
        <label>
          <input
            data-day-checkbox
            type="checkbox"
            value="${currentDay.id}"
            ${progress.isComplete ? "checked" : ""}
          >
          Mark day complete
        </label>
        <a href="${readingUrl(currentDay.readings, state.translation)}" target="_blank" rel="noreferrer">Open in BibleGateway</a>
      </div>
    </section>
  `;
}

function renderSchedule({ completedChapterIds, state, visibleDays }) {
  const rows =
    visibleDays.length > 0
      ? visibleDays
          .map((day) =>
            renderScheduleRow({
              completedChapterIds,
              day,
              expandedDayId: state.expandedDayId,
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
              data-action="filter"
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

function renderScheduleRow({ completedChapterIds, day, expandedDayId, isToday, translation }) {
  const progress = getDayChapterProgress(day, completedChapterIds);
  const isExpanded = expandedDayId === day.id;
  const detailId = `day-${day.dayNumber}-details`;
  const className = [
    "schedule-row",
    progress.isComplete ? "is-complete" : "",
    progress.isStarted && !progress.isComplete ? "is-started" : "",
    isToday ? "is-today" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${className}">
      <input
        id="day-${day.dayNumber}"
        data-day-checkbox
        type="checkbox"
        value="${day.id}"
        ${progress.isComplete ? "checked" : ""}
        aria-label="Mark ${formatFullDate(day.date)} assigned chapters complete"
      >
      <div class="date-block">
        <strong>${formatShortDate(day.date)}</strong>
        <span>Day ${day.dayNumber}</span>
      </div>
      <div class="reading-block">
        <strong>${escapeHtml(formatReading(day.readings))}</strong>
        <span>${day.chapterCount} assigned chapters</span>
      </div>
      <div class="row-progress" aria-label="${progress.completedChapters} of ${progress.totalChapters} chapters read">
        <span>${progress.completedChapters} / ${progress.totalChapters} read</span>
        <div class="mini-progress-track">
          <div class="mini-progress-bar" style="width: ${getProgressPercent(progress)}%"></div>
        </div>
      </div>
      <div class="row-actions">
        <button
          class="button secondary compact"
          data-action="toggle-day-details"
          data-day-id="${day.id}"
          type="button"
          aria-controls="${detailId}"
          aria-expanded="${isExpanded}"
        >${isExpanded ? "Hide" : "Track"}</button>
        <a class="row-link" href="${readingUrl(day.readings, translation)}" target="_blank" rel="noreferrer">Read</a>
      </div>
      ${
        isExpanded
          ? renderChapterDetail({
              completedChapterIds,
              day,
              detailId,
            })
          : ""
      }
    </article>
  `;
}

function renderChapterDetail({ completedChapterIds, day, detailId }) {
  const progress = getDayChapterProgress(day, completedChapterIds);

  return `
    <div class="chapter-detail" id="${detailId}">
      <div class="chapter-detail-heading">
        <strong>Track chapters</strong>
        <span>${progress.completedChapters} / ${progress.totalChapters} read</span>
      </div>
      ${renderChapterChecklist({
        completedChapterIds,
        day,
        idPrefix: `detail-day-${day.dayNumber}`,
      })}
    </div>
  `;
}

function renderChapterChecklist({ completedChapterIds, day, idPrefix }) {
  return `
    <div class="chapter-checklist" aria-label="${escapeHtml(formatShortDate(day.date))} chapters">
      ${day.chapters
        .map((chapter, index) => {
          const inputId = `${idPrefix}-chapter-${index + 1}`;
          const isComplete = completedChapterIds.has(chapter.id);

          return `
            <label class="chapter-check ${isComplete ? "is-complete" : ""}" for="${inputId}">
              <input
                id="${inputId}"
                data-chapter-checkbox
                type="checkbox"
                value="${escapeHtml(chapter.id)}"
                ${isComplete ? "checked" : ""}
                aria-label="Mark ${escapeHtml(chapter.id)} read"
              >
              <span>${escapeHtml(chapter.id)}</span>
            </label>
          `;
        })
        .join("")}
    </div>
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

function getVisibleDays({ completedChapterIds, filter, plan, query }) {
  const normalizedQuery = query.trim().toLowerCase();

  return plan.filter((day) => {
    const progress = getDayChapterProgress(day, completedChapterIds);
    const reading = formatReading(day.readings).toLowerCase();
    const chapterText = day.chapters.map((chapter) => chapter.id).join(" ").toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      reading.includes(normalizedQuery) ||
      chapterText.includes(normalizedQuery) ||
      day.date.includes(normalizedQuery);
    const matchesFilter =
      filter === "all" ||
      (filter === "remaining" && !progress.isComplete) ||
      (filter === "complete" && progress.isComplete);

    return matchesQuery && matchesFilter;
  });
}

function findDayById(plan, dayId) {
  return plan.find((day) => day.id === dayId) ?? null;
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

function getDayStatusText(progress) {
  if (progress.isComplete) {
    return "Complete";
  }

  if (progress.isStarted) {
    return `${progress.completedChapters} / ${progress.totalChapters} read`;
  }

  return "Open";
}

function getProgressPercent(progress) {
  return progress.totalChapters === 0
    ? 0
    : (progress.completedChapters / progress.totalChapters) * 100;
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
