import assert from "node:assert/strict";
import test from "node:test";

import { captureViewportState, restoreViewportState } from "../../src/viewport.js";

test("viewport state preserves page and schedule scroll across a render", () => {
  const activeElement = { id: "detail-day-8-chapter-2" };
  const originalScheduleList = { scrollTop: 420 };
  const nextScheduleList = { scrollTop: 0 };
  const focusedElement = {
    focus(options) {
      focusedElement.options = options;
    },
  };
  const root = {
    contains(element) {
      return element === activeElement;
    },
    querySelector(selector) {
      return selector === ".schedule-list" ? originalScheduleList : null;
    },
  };
  const nextRoot = {
    querySelector(selector) {
      return selector === ".schedule-list" ? nextScheduleList : null;
    },
  };
  const documentRef = {
    activeElement,
    getElementById(id) {
      return id === activeElement.id ? focusedElement : null;
    },
  };
  const windowRef = {
    scrollX: 12,
    scrollY: 860,
    scrollTo(x, y) {
      windowRef.restoredScroll = { x, y };
    },
  };

  const viewportState = captureViewportState({ documentRef, root, windowRef });

  assert.deepEqual(viewportState, {
    activeElementId: "detail-day-8-chapter-2",
    scheduleScrollTop: 420,
    windowScrollX: 12,
    windowScrollY: 860,
  });

  restoreViewportState(viewportState, { documentRef, root: nextRoot, windowRef });

  assert.equal(nextScheduleList.scrollTop, 420);
  assert.deepEqual(windowRef.restoredScroll, { x: 12, y: 860 });
  assert.deepEqual(focusedElement.options, { preventScroll: true });
});
