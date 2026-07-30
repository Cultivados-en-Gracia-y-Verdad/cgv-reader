import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

type Place = "above" | "below";

const GAP = 10;
const ESTIMATED_HEIGHT = 96;

/**
 * Morphology / interlinear detail that escapes scroll containers.
 * Uses a dedicated floating class (not `.token-detail-popover`) so absolute
 * `bottom` / `opacity: 0` rules cannot stretch or hide the tip.
 */
export function TokenDetailPopover({
  open,
  anchor,
  children
}: {
  open: boolean;
  anchor: HTMLElement | null;
  children: ReactNode;
}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [place, setPlace] = useState<Place>("below");

  const reposition = useCallback(() => {
    if (!open || !anchor) {
      setStyle(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const tipHeight = tipRef.current?.offsetHeight || ESTIMATED_HEIGHT;
    const bricks = document.querySelector<HTMLElement>(".greek-panel .participation-switch");
    const ceiling = bricks ? bricks.getBoundingClientRect().bottom + GAP : GAP;
    const spaceAbove = rect.top - ceiling;
    const nextPlace: Place = spaceAbove >= tipHeight + GAP ? "above" : "below";
    setPlace(nextPlace);

    const left = Math.min(
      Math.max(rect.left + rect.width / 2, 12),
      window.innerWidth - 12
    );

    setStyle({
      position: "fixed",
      left,
      top: nextPlace === "above" ? rect.top - GAP : rect.bottom + GAP,
      transform: nextPlace === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      zIndex: 2147483000,
      bottom: "auto",
      right: "auto",
      opacity: 1,
      visibility: "visible",
      pointerEvents: "none"
    });
  }, [open, anchor]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Second pass once the tip has real height (flip above/below accurately).
  useLayoutEffect(() => {
    if (!open || !anchor || !tipRef.current) return;
    reposition();
  }, [open, anchor, children, reposition]);

  useEffect(() => {
    if (!open || !anchor) return;
    const scrollParent = nearestScrollParent(anchor);
    const onMove = () => reposition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    scrollParent?.addEventListener("scroll", onMove, { passive: true });
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      scrollParent?.removeEventListener("scroll", onMove);
    };
  }, [open, anchor, reposition]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <span
      ref={tipRef}
      className={`token-detail-floating token-detail-floating--${place}`}
      role="tooltip"
      style={style ?? { position: "fixed", left: -9999, top: -9999, opacity: 0 }}
    >
      {children}
    </span>,
    document.body
  );
}

/** Hover/focus wrapper that drives {@link TokenDetailPopover}. */
export function TokenDetailAnchor({
  className,
  disabled,
  "aria-pressed": ariaPressed,
  "aria-label": ariaLabel,
  "data-token-id": dataTokenId,
  onClick,
  surface,
  detail
}: {
  className: string;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  "aria-label"?: string;
  "data-token-id"?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  surface: ReactNode;
  detail: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const show = () => {
    setAnchor(ref.current);
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        disabled={disabled}
        aria-pressed={ariaPressed}
        aria-label={ariaLabel}
        data-token-id={dataTokenId}
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {surface}
      </button>
      <TokenDetailPopover open={open} anchor={anchor}>
        {detail}
      </TokenDetailPopover>
    </>
  );
}

function nearestScrollParent(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
