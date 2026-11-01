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
  onNavigate?: () => void;
  linkMode?: "router" | "button";
  onReorder?: (
    dragId: string,
    dropId: string,
    position: "before" | "after" | "inside",
  ) => void;
};

export function DocTree({
  nodes,
  activeId,
  baseHref,
  depth = 0,
  onSelect,
  onNavigate,
  linkMode = "router",
  onReorder,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  return (
    <ul
      className="flex flex-col gap-0.5"
      style={{ paddingLeft: depth ? 12 : 0 }}
    >
      {nodes.map((node) => {
        const isActive = node.id === activeId;
        const label =
          node.kind === "category"
            ? node.title
            : node.kind === "link"
              ? `↗ ${node.title}`
              : node.title;
        const hiddenMark = node.hidden ? " · masquée" : "";

        const className = [
          "doc-tree-link block min-h-9 w-full break-words rounded-md px-2 py-2 text-left text-sm leading-snug",
          isActive
            ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
            : "text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
          node.kind === "category" ? "font-semibold" : "",
          dragOverId === node.id ? "ring-1 ring-[var(--accent)]" : "",
        ].join(" ");

        return (
          <li
            key={node.id}
            draggable={Boolean(onReorder)}
            onDragStart={(e) => {
              if (!onReorder) return;
              e.stopPropagation();
              e.dataTransfer.setData("text/doc-id", node.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverId(node.id);
            }}
            onDragLeave={() =>
              setDragOverId((id) => (id === node.id ? null : id))
            }
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverId(null);
              const dragId = e.dataTransfer.getData("text/doc-id");
              if (!dragId || dragId === node.id) return;
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              const y = e.clientY - rect.top;
              const position =
                node.kind === "category" &&
                y > rect.height * 0.25 &&
                y < rect.height * 0.75
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
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect?.(node.id)}
              >
                {label}
                {hiddenMark ? (
                  <span className="text-sm text-[var(--ink-faint)]">
                    {hiddenMark}
                  </span>
                ) : null}
              </button>
            ) : node.kind === "link" && node.href ? (
              <a
                href={node.href}
                className={className}
                target="_blank"
                rel="noreferrer"
                onClick={onNavigate}
              >
                {label}
              </a>
            ) : (
              <Link
                href={baseHref(node)}
                className={className}
                aria-current={isActive ? "page" : undefined}
                onClick={onNavigate}
              >
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
                onNavigate={onNavigate}
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
