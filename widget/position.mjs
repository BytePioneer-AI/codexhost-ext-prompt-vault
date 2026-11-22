import { readLocal, writeLocal } from "../shared/history.mjs";

const POSITION_KEY = "codexhost.prompt-vault.widget-pos.v1";
const DRAG_THRESHOLD = 5;
const DOCK_THRESHOLD = 32;
const GAP = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(min, max), Math.max(min, value));
}

export function positionWidget({ doc, shell, trigger, dialog, toast, beforePress }) {
  const win = doc.defaultView;
  const visual = win.visualViewport;
  const saved = readLocal(win, POSITION_KEY);
  let position = Number.isFinite(saved?.x) && Number.isFinite(saved?.y)
    ? { x: saved.x, y: saved.y, dock: ["left", "right"].includes(saved.dock) ? saved.dock : "" }
    : null;
  let drag = null;
  let suppressPointerClick = false;
  let frame = 0;
  let open = false;

  function bounds() {
    const { clientWidth, clientHeight } = doc.documentElement;
    const left = visual?.offsetLeft || 0;
    const top = visual?.offsetTop || 0;
    return {
      left, top,
      right: Math.min(clientWidth, left + (visual?.width || clientWidth)),
      bottom: Math.min(clientHeight, top + (visual?.height || clientHeight)),
    };
  }

  function placeTrigger(view) {
    const width = trigger.getBoundingClientRect().width;
    const height = trigger.offsetHeight;
    const dock = position?.dock ?? "right";
    const x = dock === "left" ? view.left : dock === "right" ? Math.max(view.left, view.right - width)
      : clamp(position.x, view.left, view.right - width);
    const y = clamp(position?.y ?? view.bottom - height - 76, view.top, view.bottom - height);
    trigger.dataset.dock = dock;
    trigger.style.left = `${x}px`;
    trigger.style.top = `${y}px`;
    return { x, y, width, height };
  }

  function layout() {
    const view = bounds();
    const anchor = placeTrigger(view);
    const left = view.left + GAP;
    const right = view.right - GAP;
    const top = view.top + GAP;
    const bottom = view.bottom - GAP;
    const midX = anchor.x + anchor.width / 2;
    const midY = anchor.y + anchor.height / 2;
    const preferLeft = midX > (view.left + view.right) / 2;
    const preferUp = midY > (view.top + view.bottom) / 2;
    const above = anchor.y - GAP;
    const below = anchor.y + anchor.height + GAP;

    if (open) {
      const width = Math.max(0, Math.min(360, view.right - view.left - 24));
      let maxHeight = Math.max(0, Math.min(440, view.bottom - view.top - 32));
      const onLeft = anchor.x - GAP - width;
      const onRight = anchor.x + anchor.width + GAP;
      const fitsLeft = onLeft >= left;
      const fitsRight = onRight + width <= right;
      const beside = fitsLeft || fitsRight;
      const useLeft = fitsLeft && (preferLeft || !fitsRight);
      const spaceAbove = above - top;
      const spaceBelow = bottom - below;
      const useAbove = spaceAbove > spaceBelow;
      const verticalRoom = Math.max(spaceAbove, spaceBelow);
      if (!beside && verticalRoom >= Math.min(156, maxHeight)) {
        maxHeight = Math.min(maxHeight, verticalRoom);
      }
      dialog.style.width = `${width}px`;
      dialog.style.maxHeight = `${maxHeight}px`;
      const height = dialog.offsetHeight;
      const x = beside ? (useLeft ? onLeft : onRight) : (preferLeft ? midX - width : midX);
      const y = beside ? (preferUp ? anchor.y + anchor.height - height : anchor.y)
        : (useAbove ? above - height : below);
      dialog.style.left = `${clamp(x, left, right - width)}px`;
      dialog.style.top = `${clamp(y, top, bottom - height)}px`;
      dialog.style.transformOrigin = `${(beside ? useLeft : preferLeft) ? "right" : "left"} ${(beside ? preferUp : !useAbove) ? "bottom" : "top"}`;
    }

    if (!toast.hidden) {
      toast.style.maxWidth = `${Math.max(0, right - left)}px`;
      const width = toast.offsetWidth;
      const height = toast.offsetHeight;
      // Keep confirmations clear of the panel and near its trigger.
      const y = open ? (preferUp ? below : above - height) : (preferUp ? above - height : below);
      toast.style.left = `${clamp(preferLeft ? anchor.x + anchor.width - width : anchor.x, left, right - width)}px`;
      toast.style.top = `${clamp(y, top, bottom - height)}px`;
    }
    return anchor;
  }

  function schedule() {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      layout();
    });
  }

  function pointerDown(event) {
    if (drag || !event.isPrimary || event.button !== 0) return;
    suppressPointerClick = false;
    beforePress();
    // Preserve composer focus and page selections until a click actually opens the picker.
    event.preventDefault();
    const { x, y } = placeTrigger(bounds());
    const handle = trigger.getBoundingClientRect();
    drag = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      x, y, gripX: event.clientX - handle.left, previous: position, moved: false,
    };
    trigger.setPointerCapture(event.pointerId);
  }

  function move(event) {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      trigger.dataset.dragging = "true";
      if (drag.previous?.dock || !drag.previous) drag.x = drag.startX - drag.gripX;
    }
    position = { x: drag.x + dx, y: drag.y + dy, dock: "" };
    layout();
  }

  function end(event) {
    if (drag?.id !== event.pointerId) return;
    if (event.type === "pointerup") move(event);
    if (drag.moved) {
      suppressPointerClick = true;
      if (event.type === "pointerup") {
        const view = bounds();
        const { x, y, width } = placeTrigger(view);
        const fromLeft = x - view.left;
        const fromRight = view.right - x - width;
        const dock = Math.min(fromLeft, fromRight) <= DOCK_THRESHOLD
          ? (fromLeft <= fromRight ? "left" : "right") : "";
        position = { x, y, dock };
        writeLocal(win, POSITION_KEY, position);
      } else {
        position = drag.previous;
      }
    }
    drag = null;
    delete trigger.dataset.dragging;
    layout();
  }

  const listeners = [
    [trigger, "pointerdown", pointerDown], [trigger, "pointermove", move],
    [trigger, "pointerup", end], [trigger, "pointercancel", end], [trigger, "lostpointercapture", end],
    [win, "resize", schedule], [visual, "resize", schedule], [visual, "scroll", schedule],
  ];
  for (const [node, type, listener] of listeners) node?.addEventListener(type, listener);
  const observer = new win.ResizeObserver(layout);
  observer.observe(trigger);
  observer.observe(dialog);
  layout();

  return {
    layout,
    setOpen(value) {
      open = value;
      if (value) layout();
      shell.dataset.open = String(value);
    },
    draggedClick(event) {
      // Keyboard/AT clicks have detail 0. A fresh pointer press always clears the latch.
      return suppressPointerClick && event.detail !== 0;
    },
    dispose() {
      for (const [node, type, listener] of listeners) node?.removeEventListener(type, listener);
      observer.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      if (drag && trigger.hasPointerCapture(drag.id)) trigger.releasePointerCapture(drag.id);
    },
  };
}
