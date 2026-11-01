"use client";

import type { Editor } from "@tiptap/react";

type Props = {
  editor: Editor | null;
  disabled?: boolean;
};

function ToolButton({
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={Boolean(active)}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        "min-h-9 min-w-9 shrink-0 rounded px-2 py-1 text-sm font-medium disabled:opacity-40",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function EditorToolbar({ editor, disabled }: Props) {
  if (!editor) return null;
  const off = Boolean(disabled || !editor.isEditable);

  return (
    <div
      role="group"
      aria-label="Mise en forme du document"
      className="editor-toolbar flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5"
    >
      <ToolButton
        label="B"
        title="Gras"
        disabled={off}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        label="I"
        title="Italique"
        disabled={off}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        label="U"
        title="Souligné"
        disabled={off}
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolButton
        label="S"
        title="Barré"
        disabled={off}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolButton
        label="<>"
        title="Code dans le texte"
        disabled={off}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolButton
        label="Lien"
        title="Ajouter un lien"
        disabled={off}
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const href = window.prompt("URL du lien", prev || "https://");
          if (href === null) return;
          if (!href) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href })
            .run();
        }}
      />
      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
      <ToolButton
        label="H1"
        title="Titre 1"
        disabled={off}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolButton
        label="H2"
        title="Titre 2"
        disabled={off}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        label="H3"
        title="Titre 3"
        disabled={off}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
      <ToolButton
        label="• Liste"
        title="Liste à puces"
        disabled={off}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        label="1. Liste"
        title="Liste numérotée"
        disabled={off}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        label="☑ Tâches"
        title="Liste de tâches"
        disabled={off}
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <span className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
      <ToolButton
        label="Citation"
        title="Citation"
        disabled={off}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolButton
        label="Code"
        title="Bloc de code"
        disabled={off}
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolButton
        label="Tableau"
        title="Insérer un tableau"
        disabled={off}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />
      <ToolButton
        label="Image"
        title="Insérer une image"
        disabled={off}
        onClick={() => {
          const src = window.prompt("URL de l’image", "https://");
          if (!src) return;
          const alt = window.prompt(
            "Description de l’image (laisser vide si elle est décorative)",
            "",
          );
          if (alt === null) return;
          editor.chain().focus().setImage({ src, alt }).run();
        }}
      />
      <ToolButton
        label="Encadré"
        title="Encadré info"
        disabled={off}
        active={editor.isActive("callout")}
        onClick={() => editor.chain().focus().setCallout("info").run()}
      />
    </div>
  );
}
