import type { TipTapDoc, TipTapNode } from "@/lib/types";
import { useId, type ReactNode } from "react";
import { extractText } from "@/lib/tiptap-text";

const safeUrl = (value: unknown, image = false) =>
  typeof value === "string" &&
  (image ? /^https?:\/\// : /^(https?:\/\/|mailto:|#|\/(?!\/))/).test(value)
    ? value
    : undefined;
export function DocumentContent({ content }: { content: TipTapDoc }) {
  const id = useId();
  let heading = 0;
  let task = 0;
  function render(node: TipTapNode, key: number): ReactNode {
    const children =
      node.type === "taskItem" ? null : node.content?.map(render);
    switch (node.type) {
      case "text": {
        let text: ReactNode = node.text ?? "";
        for (const mark of node.marks ?? []) {
          if (mark.type === "bold") text = <strong>{text}</strong>;
          if (mark.type === "italic") text = <em>{text}</em>;
          if (mark.type === "code") text = <code>{text}</code>;
          if (mark.type === "strike") text = <s>{text}</s>;
          if (mark.type === "underline") text = <u>{text}</u>;
          if (mark.type === "link")
            text = (
              <a href={safeUrl(mark.attrs?.href)} rel="noopener noreferrer">
                {text}
              </a>
            );
        }
        return <span key={key}>{text}</span>;
      }
      case "heading": {
        const id = `section-${heading++}`;
        return Number(node.attrs?.level) === 1 ? (
          <h2 id={id} key={key}>
            {children}
          </h2>
        ) : Number(node.attrs?.level) === 3 ? (
          <h3 id={id} key={key}>
            {children}
          </h3>
        ) : (
          <h2 id={id} key={key}>
            {children}
          </h2>
        );
      }
      case "paragraph":
        return <p key={key}>{children}</p>;
      case "bulletList":
        return <ul key={key}>{children}</ul>;
      case "orderedList":
        return <ol key={key}>{children}</ol>;
      case "listItem":
        return <li key={key}>{children}</li>;
      case "blockquote":
        return <blockquote key={key}>{children}</blockquote>;
      case "codeBlock":
        return (
          <pre key={key} tabIndex={0} aria-label="Bloc de code">
            <code>{children}</code>
          </pre>
        );
      case "hardBreak":
        return <br key={key} />;
      case "horizontalRule":
        return <hr key={key} />;
      // Reader images use the supplied remote URL without a server-side proxy.
      case "image":
        return safeUrl(node.attrs?.src, true) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key}
            src={safeUrl(node.attrs?.src, true)}
            alt={String(node.attrs?.alt ?? "")}
            loading="lazy"
          />
        ) : null;
      case "table":
        return (
          <div
            key={key}
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Tableau du document"
          >
            <table>
              <tbody>{children}</tbody>
            </table>
          </div>
        );
      case "tableRow":
        return <tr key={key}>{children}</tr>;
      case "tableCell":
        return <td key={key}>{children}</td>;
      case "tableHeader":
        return <th key={key}>{children}</th>;
      case "taskList":
        return (
          <ul data-type="taskList" key={key}>
            {children}
          </ul>
        );
      case "taskItem": {
        const inputId = `${id}-task-${task++}`;
        const [first, ...rest] = node.content ?? [];
        const hasLabel = first?.type === "paragraph";
        return (
          <li key={key}>
            <input
              id={inputId}
              type="checkbox"
              checked={Boolean(node.attrs?.checked)}
              disabled
              aria-label={
                hasLabel &&
                extractText({ type: "doc", content: [first] }).trim()
                  ? undefined
                  : "Tâche"
              }
              className="mt-1 h-4 w-4 shrink-0"
            />
            <div>
              {hasLabel ? (
                <>
                  <p>
                    <label htmlFor={inputId}>
                      {first.content?.map(render)}
                    </label>
                  </p>
                  {rest.map(render)}
                </>
              ) : (
                node.content?.map(render)
              )}
            </div>
          </li>
        );
      }
      case "callout": {
        const variant = ["warning", "success"].includes(
          String(node.attrs?.variant),
        )
          ? String(node.attrs?.variant)
          : "info";
        return (
          <aside
            key={key}
            role="note"
            aria-label={
              variant === "warning"
                ? "Attention"
                : variant === "success"
                  ? "Succès"
                  : "Information"
            }
            className={`doc-callout doc-callout--${variant}`}
          >
            <p lang="fr" className="doc-callout-label">
              {variant === "warning"
                ? "Attention"
                : variant === "success"
                  ? "Succès"
                  : "Information"}
            </p>
            <div>{children}</div>
          </aside>
        );
      }
      default:
        return <div key={key}>{children}</div>;
    }
  }
  return <div className="doc-editor">{content.content?.map(render)}</div>;
}
