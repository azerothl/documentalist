"use client";

import { useEffect, useMemo, useState } from "react";

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: () => void;
};

type Props = {
  open: boolean;
  query: string;
  items: SlashItem[];
  anchor: { top: number; left: number } | null;
  onClose: () => void;
};

export function SlashMenu({ open, query, items, anchor, onClose }: Props) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q)),
    );
  }, [items, query]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[index]?.run();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, index, onClose]);

  if (!open || !anchor) return null;

  return (
    <div
      className="fixed z-50 w-72 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]"
      style={{ top: anchor.top, left: anchor.left }}
      role="listbox"
      aria-label="Blocs disponibles"
      aria-activedescendant={
        filtered[index] ? `slash-${filtered[index].id}` : undefined
      }
    >
      <div className="border-b border-[var(--line)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
        Blocs {query ? `· /${query}` : ""}
      </div>
      <ul className="max-h-64 overflow-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-[var(--ink-faint)]">
            Aucun résultat
          </li>
        ) : (
          filtered.map((item, i) => (
            <li key={item.id}>
              <button
                id={`slash-${item.id}`}
                role="option"
                aria-selected={i === index}
                type="button"
                className={[
                  "flex w-full flex-col px-3 py-2 text-left text-sm",
                  i === index
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "hover:bg-[var(--surface-hover)]",
                ].join(" ")}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-[11px] text-[var(--ink-faint)]">
                  {item.hint}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
