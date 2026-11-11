import type { TipTapDoc, TipTapNode } from "@/lib/types";
import { useId, type ReactNode } from "react";
import { extractText } from "@/lib/tiptap-text";
import { getPortalUi } from "@/lib/portal-i18n";
import { CircleAlert, CircleCheck, Info, Link2 } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";

const safeUrl = (value: unknown, image = false) =>
  typeof value === "string" &&
  (image ? /^https?:\/\// : /^(https?:\/\/|mailto:|#|\/(?!\/))/).test(value)
    ? value
    : undefined;
export function DocumentContent({
  content,
  locale = "fr",
}: {
  content: TipTapDoc;
  locale?: string;
}) {
  const id = useId();
  const { language, messages } = getPortalUi(locale);
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
        // Mouse shortcut to the section link, as on react.dev. Keyboard and
        // screen-reader users reach the same anchors through "On this page".
        const anchor = (
          <a
            href={`#${id}`}
            className="heading-anchor"
            aria-hidden="true"
            tabIndex={-1}
          >
            <Link2 size={18} />
          </a>
        );
        return Number(node.attrs?.level) === 3 ? (
          <h3 id={id} key={key}>
            {children}
            {anchor}
          </h3>
        ) : (
          <h2 id={id} key={key}>
            {children}
            {anchor}
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
      case "codeBlock": {
        const language =
          typeof node.attrs?.language === "string" &&
          /^[\w+#.-]{1,24}$/.test(node.attrs.language)
            ? node.attrs.language
            : "";
        return (
          <div
            key={key}
            className="code-block"
            data-labelled={language ? "true" : undefined}
          >
            {language ? (
              <span className="code-block-label" aria-hidden="true">
                {language}
              </span>
            ) : null}
            <pre
              tabIndex={0}
              aria-label={
                language
                  ? `${messages.content.codeBlock} (${language})`
                  : messages.content.codeBlock
              }
            >
              <code>{children}</code>
            </pre>
            <CopyButton
              text={(node.content ?? []).map((n) => n.text ?? "").join("")}
              label={messages.content.copyCode}
              copiedLabel={messages.content.codeCopied}
            />
          </div>
        );
      }
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
            aria-label={messages.content.table}
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
                  : messages.content.task
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
                ? messages.content.warning
                : variant === "success"
                  ? messages.content.success
                  : messages.content.information
            }
            className={`doc-callout doc-callout--${variant}`}
          >
            <p lang={language} className="doc-callout-label">
              {variant === "warning" ? (
                <CircleAlert size={20} aria-hidden="true" />
              ) : variant === "success" ? (
                <CircleCheck size={20} aria-hidden="true" />
              ) : (
                <Info size={20} aria-hidden="true" />
              )}
              {variant === "warning"
                ? messages.content.warning
                : variant === "success"
                  ? messages.content.success
                  : messages.content.information}
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
