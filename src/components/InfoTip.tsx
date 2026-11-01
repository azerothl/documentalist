"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Small help bubble next to a form label. Opens on hover, keyboard focus or
 * click (touch), closes with Escape. The text stays in the accessibility
 * tree through aria-describedby on the trigger.
 */
export function InfoTip({
  label,
  children,
  align = "center",
}: {
  /** Accessible name of the trigger, e.g. "Aide : dossier Learn" */
  label: string;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="info-tip"
      data-align={align}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip" className="info-tip-bubble" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
