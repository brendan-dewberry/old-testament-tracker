export function captureViewportState({
  documentRef = globalThis.document,
  root,
  windowRef = globalThis.window,
} = {}) {
  if (!documentRef || !root || !windowRef) {
    return null;
  }

  const scheduleList = root.querySelector(".schedule-list");
  const activeElement = documentRef.activeElement;

  return {
    activeElementId:
      activeElement && root.contains(activeElement) && activeElement.id
        ? activeElement.id
        : "",
    scheduleScrollTop: scheduleList?.scrollTop ?? 0,
    windowScrollX: windowRef.scrollX ?? 0,
    windowScrollY: windowRef.scrollY ?? 0,
  };
}

export function restoreViewportState(
  viewportState,
  { documentRef = globalThis.document, root, windowRef = globalThis.window } = {},
) {
  if (!viewportState || !documentRef || !root || !windowRef) {
    return;
  }

  const scheduleList = root.querySelector(".schedule-list");

  if (scheduleList) {
    scheduleList.scrollTop = viewportState.scheduleScrollTop;
  }

  if (viewportState.activeElementId) {
    documentRef
      .getElementById(viewportState.activeElementId)
      ?.focus({ preventScroll: true });
  }

  windowRef.scrollTo?.(viewportState.windowScrollX, viewportState.windowScrollY);
}
