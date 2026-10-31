"use client";

import Link from "next/link";
import { useState } from "react";
import type { DocTreeNode } from "@/lib/types";

type Props = {
  nodes: DocTreeNode[];
  activeId?: string | null;
  baseHref: (node: DocTreeNode) => string;
  depth?: number;
  onSelect?: (id: string) => void;
  linkMode?: "router" | "button";
  onReorder?: (dragId: string, dropId: string, position: "before" | "after" | "inside") => void;
};

export function DocTree({
  nodes,
  activeId,
  baseHref,
  depth = 0,
  onSelect,
  linkMode = "router",
  onReorder,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-0.5" style={{ paddingLeft: depth ? 12 : 0 }}>
      {nodes.map((node) => {
        const isActive = node.id === activeId;
        const label =
          node.kind === "category"
            ? node.title
            : node.kind === "link"
              ? `↗ ${node.title}`
              : node.title;
        const hiddenMark = node.hidden ? " · hidden" : "";

        const className = [
          "block w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors",
          isActive
            ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
            : "text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
          node.kind === "category"
            ? "uppercase tracking-wide text-[11px] font-semibold"
            : "",
          dragOverId === node.id ? "ring-1 ring-[var(--accent)]" : "",
        ].join(" ");

        return (
          <li
            key={node.id}
            draggable={Boolean(onReorder)}
            onDragStart={(e) => {
              if (!onReorder) return;
              e.dataTransfer.setData("text/doc-id", node.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              setDragOverId(node.id);
            }}
            onDragLeave={() => setDragOverId((id) => (id === node.id ? null : id))}
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              setDragOverId(null);
              const dragId = e.dataTransfer.getData("text/doc-id");
              if (!dragId || dragId === node.id) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const y = e.clientY - rect.top;
              const position =
                node.kind === "category" && y > rect.height * 0.25 && y < rect.height * 0.75
                  ? "inside"
                  : y < rect.height / 2
                    ? "before"
                    : "after";
              onReorder(dragId, node.id, position);
            }}
          >
            {linkMode === "button" || onSelect ? (
              <button
                type="button"
                className={className}
                onClick={() => onSelect?.(node.id)}
              >
                {label}
                {hiddenMark ? (
                  <span className="text-[10px] text-[var(--ink-faint)]">{hiddenMark}</span>
                ) : null}
              </button>
            ) : node.kind === "link" && node.href ? (
              <a
                href={node.href}
                className={className}
                target="_blank"
                rel="noreferrer"
              >
                {label}
              </a>
            ) : (
              <Link href={baseHref(node)} className={className}>
                {label}
              </Link>
            )}
            {node.children.length > 0 ? (
              <DocTree
                nodes={node.children}
                activeId={activeId}
                baseHref={baseHref}
                depth={depth + 1}
                onSelect={onSelect}
                linkMode={linkMode}
                onReorder={onReorder}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
