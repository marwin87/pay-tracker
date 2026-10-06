import { useEffect, useLayoutEffect, type RefObject } from "react";

// Above modals (z-50) and the mobile footer (z-40).
const POPUP_Z_INDEX = 60;
const GAP = 6;
const EDGE = 8;

interface Options {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  /** The popup element: render it through a portal with the `fixed` class. */
  popupRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: "left" | "right";
  /** "min": popup is at least as wide as the trigger. "exact": same width. */
  width?: "min" | "exact";
}

/**
 * Anchors a portaled popup to its trigger: clamped to the viewport horizontally,
 * flipped above the trigger when there is no room below. Closes on page scroll or
 * width resize (scrolling inside the popup is ignored).
 */
export function usePopupPosition({ open, triggerRef, popupRef, onClose, align = "left", width }: Options) {
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!open || !trigger || !popup) return;
    popup.style.left = "0px"; // measure at the viewport edge so the width isn't squeezed
    const rect = trigger.getBoundingClientRect();
    if (width === "exact") popup.style.width = `${rect.width}px`;
    else if (width === "min") popup.style.minWidth = `${rect.width}px`;
    const { width: w, height: h } = popup.getBoundingClientRect();

    const preferred = align === "right" ? rect.right - w : rect.left;
    popup.style.left = `${Math.max(EDGE, Math.min(preferred, window.innerWidth - w - EDGE))}px`;

    const flip = window.innerHeight - rect.bottom < h + GAP + EDGE && rect.top > window.innerHeight - rect.bottom;
    popup.style.top = flip ? "auto" : `${rect.bottom + GAP}px`;
    popup.style.bottom = flip ? `${window.innerHeight - rect.top + GAP}px` : "auto";
    popup.style.zIndex = String(POPUP_Z_INDEX);
  }, [open, triggerRef, popupRef, align, width]);

  useEffect(() => {
    if (!open) return;
    const startWidth = window.innerWidth;
    const start = triggerRef.current?.getBoundingClientRect();
    function onScroll(e: Event) {
      if (e.target instanceof Node && popupRef.current?.contains(e.target)) return;
      // A scroll event can land after the popup opened (e.g. the browser scrolled the
      // trigger into view just before the click): only close if the trigger really moved.
      const now = triggerRef.current?.getBoundingClientRect();
      if (start && now && Math.abs(now.top - start.top) < 1 && Math.abs(now.left - start.left) < 1) return;
      onClose();
    }
    // Width only: a mobile keyboard resizes the height and must not close the popup.
    function onResize() {
      if (window.innerWidth !== startWidth) onClose();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, triggerRef, popupRef, onClose]);
}
