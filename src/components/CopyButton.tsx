"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/** Copies text to the clipboard and confirms for two seconds. */
export function CopyButton({
  text,
  label,
  copiedLabel,
  className = "copy-button",
  children,
  title,
}: {
  text: string | (() => string);
  label: string;
  copiedLabel: string;
  className?: string;
  children?: ReactNode;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      data-copied={copied}
      title={title}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            typeof text === "function" ? text() : text,
          );
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
      <span aria-live="polite">
        {copied ? copiedLabel : (children ?? label)}
      </span>
    </button>
  );
}
