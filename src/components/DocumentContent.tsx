import type { TipTapDoc, TipTapNode } from "@/lib/types";
import type { ReactNode } from "react";

const safeUrl = (value: unknown, image = false) =>
  typeof value === "string" &&
  (image ? /^https?:\/\// : /^(https?:\/\/|mailto:|#|\/(?!\/))/).test(value)
    ? value
    : undefined;
export function DocumentContent({ content }: { content: TipTapDoc }) {
  let heading = 0;
  function render(node: TipTapNode, key: number): ReactNode {
    const children = node.content?.map(render);
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
          <pre key={key}>
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
          <div key={key} className="overflow-x-auto">
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
      case "taskItem":
        return (
          <li key={key}>
            <span aria-label={node.attrs?.checked ? "Terminé" : "À faire"}>
              {node.attrs?.checked ? "☑" : "☐"}
            </span>
            <div>{children}</div>
          </li>
        );
      case "callout":
        return (
          <aside key={key} className="doc-callout">
            {children}
          </aside>
        );
      default:
        return <div key={key}>{children}</div>;
    }
  }
  return <div className="doc-editor">{content.content?.map(render)}</div>;
}
