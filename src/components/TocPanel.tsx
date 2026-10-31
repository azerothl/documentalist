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
      <div className="flex border-b border-[var(--line)] text-[12px] font-medium">
        <span className="border-b-2 border-[var(--accent)] px-3 py-2.5 text-[var(--ink)]">
          Contents
        </span>
        <span className="px-3 py-2.5 text-[var(--ink-faint)]">Comments</span>
        <span className="px-3 py-2.5 text-[var(--ink-faint)]">Code</span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
          On this page
        </p>
        {headings.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-faint)]">
            Headings appear here as you write.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {headings.map((h) => (
              <li
                key={h.id}
                className="text-[13px] text-[var(--ink-muted)]"
                style={{ paddingLeft: (h.level - 1) * 10 }}
              >
                {h.text}
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
