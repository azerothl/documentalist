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
  canReorder?: (node: DocTreeNode) => boolean;
  canDrop?: (
    node: DocTreeNode,
    position: "before" | "after" | "inside",
  ) => boolean;
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
  canReorder,
  canDrop,
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
        const sourceMark =
          canReorder?.(node) === false ? (
            <span
              className="ml-1 text-[10px] font-normal text-[var(--ink-faint)]"
              title="Importé depuis GitHub, lecture seule"
              aria-hidden="true"
            >
              GitHub · lecture seule
            </span>
          ) : null;

        // Styled in globals.css like the portal sidebar rows.
        const className = "doc-tree-link";
        const rowData = {
          "data-kind": node.kind,
          "data-depth": depth,
          "data-drop-target": dragOverId === node.id ? "true" : undefined,
        };

        return (
          <li
            key={node.id}
            draggable={Boolean(onReorder && (canReorder?.(node) ?? true))}
            onDragStart={(e) => {
              if (!onReorder || canReorder?.(node) === false) {
                e.preventDefault();
                return;
              }
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
              if (canDrop && !canDrop(node, position)) return;
              onReorder(dragId, node.id, position);
            }}
          >
            {linkMode === "button" || onSelect ? (
              <button
                type="button"
                className={className}
                {...rowData}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect?.(node.id)}
              >
                {label}
                {sourceMark}
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
                {...rowData}
                target="_blank"
                rel="noreferrer"
                onClick={onNavigate}
              >
                {label}
                {sourceMark}
              </a>
            ) : (
              <Link
                href={baseHref(node)}
                className={className}
                {...rowData}
                aria-current={isActive ? "page" : undefined}
                onClick={onNavigate}
              >
                {label}
                {sourceMark}
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
                canReorder={canReorder}
                canDrop={canDrop}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
