import { Node, mergeAttributes } from "@tiptap/core";

export type CalloutVariant = "info" | "warning" | "success";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-variant") ?? "info",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'aside[data-type="callout"]',
        contentElement: (element) =>
          element.querySelector("[data-callout-content]") ?? element,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const variant = String(HTMLAttributes["data-variant"] ?? "info");
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-variant": variant,
        role: "note",
        class: `doc-callout doc-callout--${variant}`,
      }),
      [
        "p",
        { class: "doc-callout-label", contenteditable: "false" },
        variant === "warning"
          ? "Attention"
          : variant === "success"
            ? "Succès"
            : "Information",
      ],
      ["div", { "data-callout-content": "" }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (variant: CalloutVariant = "info") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { variant },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Texte de l’encadré…" }],
              },
            ],
          }),
    };
  },
});
