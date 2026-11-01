"use client";

import type { TipTapDoc } from "@/lib/types";
import { extractHeadings } from "@/lib/tiptap-text";

type Props = {
  content: TipTapDoc;
  tags?: string[];
};

export function TocPanel({ content, tags = [] }: Props) {
  const headings = extractHeadings(content);

  return (
    <aside className="flex h-full flex-col border-l border-[var(--line)] bg-[var(--surface)]">
      <p className="border-b border-[var(--line)] px-3 py-3 text-sm font-medium">
        Sommaire
      </p>
      <div className="flex-1 overflow-auto p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
          Sur cette page
        </p>
        {headings.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-faint)]">
            Aucun titre de section.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {headings.map((h, index) => (
              <li
                key={h.id}
                className="text-[13px] text-[var(--ink-muted)]"
                style={{ paddingLeft: (h.level - 1) * 10 }}
              >
                <a
                  href={`#section-${index}`}
                  className="hover:text-[var(--accent)]"
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        )}
        {tags.length > 0 ? (
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
