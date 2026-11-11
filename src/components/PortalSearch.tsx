"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  FileText,
  Search,
} from "lucide-react";
import { getPortalUi } from "@/lib/portal-i18n";
import { documentTrail, searchExcerpt } from "@/lib/reading";
import { extractText } from "@/lib/tiptap-text";
import {
  DOC_SECTIONS,
  docSection,
  type DocSection,
  type DocumentRecord,
} from "@/lib/types";

type Hit = { doc: DocumentRecord; score: number };

/** Wraps each occurrence of the query in <mark>. */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(query, from);
    if (at < 0) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * Search palette modelled on react.dev's DocSearch: results grouped by tab,
 * arrow keys to move, Enter to open, Escape to close.
 */
export function PortalSearch({
  open,
  onClose,
  pages,
  bySection,
  activeSection,
  href,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  pages: DocumentRecord[];
  bySection: Record<DocSection, DocumentRecord[]>;
  activeSection: DocSection;
  href: (doc: DocumentRecord) => string;
  locale: string;
}) {
  const router = useRouter();
  const { language, messages: t } = getPortalUi(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();

  const texts = useMemo(
    () => new Map(pages.map((d) => [d.id, extractText(d.content)])),
    [pages],
  );
  const groups = useMemo(() => {
    if (!q) return [];
    const hits: Hit[] = [];
    for (const doc of pages) {
      const title = doc.title.toLocaleLowerCase();
      const score = title.startsWith(q)
        ? 0
        : title.includes(q)
          ? 1
          : (doc.tags ?? []).join(" ").toLocaleLowerCase().includes(q)
            ? 2
            : (texts.get(doc.id) ?? "").toLocaleLowerCase().includes(q)
              ? 3
              : -1;
      if (score >= 0) hits.push({ doc, score });
    }
    hits.sort((a, b) => a.score - b.score);
    return DOC_SECTIONS.map((s) => ({
      section: s.id,
      hits: hits.filter((h) => docSection(h.doc) === s.id).slice(0, 20),
    })).filter((g) => g.hits.length);
  }, [pages, q, texts]);
  const count = groups.reduce((n, g) => n + g.hits.length, 0);
  const suggestions = bySection[activeSection]
    .filter((d) => d.kind === "page")
    .slice(0, 8);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  const links = () =>
    Array.from(
      bodyRef.current?.querySelectorAll<HTMLAnchorElement>("a.search-hit") ??
        [],
    );

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links()[0]?.focus();
    } else if (event.key === "Enter") {
      const first = groups[0]?.hits[0]?.doc ?? (q ? undefined : suggestions[0]);
      if (!first) return;
      event.preventDefault();
      onClose();
      router.push(href(first));
    }
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = links();
    const index = items.indexOf(event.target as HTMLAnchorElement);
    if (index < 0) return;
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = items[index + 1];
    else if (event.key === "ArrowUp")
      next = index === 0 ? (inputRef.current ?? undefined) : items[index - 1];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      inputRef.current?.focus();
      return;
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  function hit(doc: DocumentRecord, withExcerpt: boolean) {
    const trail = documentTrail(bySection[docSection(doc)], doc.id)
      .slice(0, -1)
      .map((d) => d.title);
    return (
      <li key={doc.id}>
        <Link href={href(doc)} className="search-hit" onClick={onClose}>
          <FileText size={18} aria-hidden="true" />
          <span className="search-hit-text">
            <span className="search-hit-title">{highlight(doc.title, q)}</span>
            {trail.length ? (
              <span className="search-hit-meta">{trail.join(" / ")}</span>
            ) : null}
            {withExcerpt ? (
              <span className="search-hit-excerpt" lang={doc.locale}>
                {highlight(searchExcerpt(doc.content, query), q)}
              </span>
            ) : null}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="search-dialog"
      aria-labelledby={titleId}
      lang={language}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose();
      }}
    >
      <h2 id={titleId} className="sr-only">
        {t.search.placeholder}
      </h2>
      <form
        className="search-form"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="search-input">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            type="search"
            aria-label={t.search.label}
            placeholder={t.search.placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          aria-label={`${t.close} (${t.search.escape})`}
        >
          {t.search.escape}
        </button>
      </form>
      <div ref={bodyRef} className="search-body" onKeyDown={onListKey}>
        {q ? (
          <section aria-label={t.search.results}>
            <p role="status" className="search-status">
              {count
                ? t.search.resultCount(count, query.trim())
                : t.search.noResults(query.trim())}
            </p>
            {count ? (
              groups.map((group) => (
                <div key={group.section}>
                  <p className="search-group-title">
                    {t.sections[group.section]}
                  </p>
                  <ul>{group.hits.map((h) => hit(h.doc, true))}</ul>
                </div>
              ))
            ) : (
              <p className="search-status">{t.search.tryAnother}</p>
            )}
          </section>
        ) : (
          <nav aria-label={t.search.suggestions(t.sections[activeSection])}>
            <p className="search-status">{t.search.emptyHint}</p>
            {suggestions.length ? (
              <>
                <p className="search-group-title">
                  {t.search.suggestions(t.sections[activeSection])}
                </p>
                <ul>{suggestions.map((doc) => hit(doc, false))}</ul>
              </>
            ) : null}
          </nav>
        )}
      </div>
      <div className="search-footer" aria-hidden="true">
        <span>
          <kbd className="kbd">
            <CornerDownLeft size={12} />
          </kbd>
          {t.search.toOpen}
        </span>
        <span>
          <kbd className="kbd">
            <ArrowDown size={12} />
          </kbd>
          <kbd className="kbd">
            <ArrowUp size={12} />
          </kbd>
          {t.search.toNavigate}
        </span>
        <span>
          <kbd className="kbd">{t.search.escape}</kbd>
          {t.search.toClose}
        </span>
      </div>
    </dialog>
  );
}
