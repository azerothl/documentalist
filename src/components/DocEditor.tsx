"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";
import { useEffect, useMemo, useRef, useState } from "react";
import { Callout } from "@/extensions/Callout";
import { EditorToolbar } from "@/components/EditorToolbar";
import { SlashMenu, type SlashItem } from "@/components/SlashMenu";
import type { TipTapDoc } from "@/lib/types";

const lowlight = createLowlight(common);

type Props = {
  documentId: string;
  content: TipTapDoc;
  editable?: boolean;
  showToolbar?: boolean;
  onChange?: (content: TipTapDoc) => void;
};

type SlashState = {
  query: string;
  from: number;
  to: number;
  anchor: { top: number; left: number };
};

function buildSlashItems(
  editor: Editor,
  range: { from: number; to: number },
): SlashItem[] {
  const replace = (fn: () => void) => () => {
    editor.chain().focus().deleteRange(range).run();
    fn();
  };

  return [
    {
      id: "h1",
      label: "Titre 1",
      hint: "Grand titre de section",
      keywords: ["h1", "title", "titre"],
      run: replace(() => editor.chain().focus().setHeading({ level: 1 }).run()),
    },
    {
      id: "h2",
      label: "Titre 2",
      hint: "Sous-section",
      keywords: ["h2", "subtitle"],
      run: replace(() => editor.chain().focus().setHeading({ level: 2 }).run()),
    },
    {
      id: "h3",
      label: "Titre 3",
      hint: "Sous-titre",
      keywords: ["h3"],
      run: replace(() => editor.chain().focus().setHeading({ level: 3 }).run()),
    },
    {
      id: "bullet",
      label: "Liste à puces",
      hint: "Points non ordonnés",
      keywords: ["ul", "list", "puce"],
      run: replace(() => editor.chain().focus().toggleBulletList().run()),
    },
    {
      id: "numbered",
      label: "Liste numérotée",
      hint: "Étapes ordonnées",
      keywords: ["ol", "ordered", "numero"],
      run: replace(() => editor.chain().focus().toggleOrderedList().run()),
    },
    {
      id: "tasks",
      label: "Liste de tâches",
      hint: "Cases à cocher",
      keywords: ["todo", "task", "checkbox"],
      run: replace(() => editor.chain().focus().toggleTaskList().run()),
    },
    {
      id: "quote",
      label: "Citation",
      hint: "Bloc citation",
      keywords: ["blockquote", "quote"],
      run: replace(() => editor.chain().focus().toggleBlockquote().run()),
    },
    {
      id: "code",
      label: "Bloc de code",
      hint: "Code source",
      keywords: ["pre", "code"],
      run: replace(() => editor.chain().focus().toggleCodeBlock().run()),
    },
    {
      id: "table",
      label: "Tableau",
      hint: "3×3 avec en-tête",
      keywords: ["table", "grid"],
      run: replace(() =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
      ),
    },
    {
      id: "divider",
      label: "Séparateur",
      hint: "Ligne horizontale",
      keywords: ["hr", "divider"],
      run: replace(() => editor.chain().focus().setHorizontalRule().run()),
    },
    {
      id: "image",
      label: "Image",
      hint: "Insérer depuis une URL",
      keywords: ["image", "img", "photo"],
      run: replace(() => {
        const src = window.prompt("URL de l’image", "https://");
        if (!src) return;
        editor.chain().focus().setImage({ src }).run();
      }),
    },
    {
      id: "callout-info",
      label: "Encadré info",
      hint: "Note mise en avant",
      keywords: ["callout", "info"],
      run: replace(() => editor.chain().focus().setCallout("info").run()),
    },
    {
      id: "callout-warning",
      label: "Encadré alerte",
      hint: "Attention",
      keywords: ["callout", "warning"],
      run: replace(() => editor.chain().focus().setCallout("warning").run()),
    },
    {
      id: "callout-success",
      label: "Encadré succès",
      hint: "Bonne pratique",
      keywords: ["callout", "success"],
      run: replace(() => editor.chain().focus().setCallout("success").run()),
    },
  ];
}

export function DocEditor({
  documentId,
  content,
  editable = true,
  showToolbar = true,
  onChange,
}: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const slashRef = useRef<SlashState | null>(null);
  const applyingExternal = useRef(false);
  const lastEmitted = useRef(JSON.stringify(content));

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    slashRef.current = slash;
  }, [slash]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: { spellcheck: "false" },
      }),
      Placeholder.configure({
        placeholder: "Écrivez ici… Tapez / pour insérer un bloc",
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
    ],
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "doc-editor prose-doc focus:outline-none min-h-[50vh] px-1",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && slashRef.current) {
          setSlash(null);
          return true;
        }
        if (
          slashRef.current &&
          (event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "Enter")
        ) {
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (applyingExternal.current) return;
      const json = ed.getJSON() as TipTapDoc;
      lastEmitted.current = JSON.stringify(json);
      onChangeRef.current?.(json);
      setTick((n) => n + 1);

      if (!ed.isEditable) {
        setSlash(null);
        return;
      }

      const { from, empty } = ed.state.selection;
      if (!empty) {
        setSlash(null);
        return;
      }

      const textBefore = ed.state.doc.textBetween(
        Math.max(0, from - 64),
        from,
        "\n",
        "\n",
      );
      const match = textBefore.match(/(?:^|\n)\/([^\s\n]*)$/);
      if (!match) {
        setSlash(null);
        return;
      }

      const query = match[1] ?? "";
      const start = from - query.length - 1;
      try {
        const coords = ed.view.coordsAtPos(start);
        setSlash({
          query,
          from: start,
          to: from,
          anchor: {
            top: Math.min(coords.bottom + 6, window.innerHeight - 280),
            left: Math.min(Math.max(8, coords.left), window.innerWidth - 300),
          },
        });
      } catch {
        setSlash(null);
      }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setTick((n) => n + 1);
      const current = slashRef.current;
      if (!current) return;
      const { from } = ed.state.selection;
      if (from < current.from || from > current.to + 40) setSlash(null);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    if (!editable) setSlash(null);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const next = JSON.stringify(content);
    if (next === lastEmitted.current) return;
    const current = JSON.stringify(editor.getJSON());
    if (current === next) {
      lastEmitted.current = next;
      return;
    }
    applyingExternal.current = true;
    editor.commands.setContent(content, { emitUpdate: false });
    lastEmitted.current = next;
    applyingExternal.current = false;
    setSlash(null);
  }, [documentId, content, editor]);

  const items = useMemo(() => {
    if (!editor || !slash) return [];
    return buildSlashItems(editor, { from: slash.from, to: slash.to });
  }, [editor, slash]);

  void tick;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showToolbar ? (
        <EditorToolbar editor={editor} disabled={!editable} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
        <EditorContent editor={editor} />
      </div>
      <SlashMenu
        open={Boolean(slash)}
        query={slash?.query ?? ""}
        items={items}
        anchor={slash?.anchor ?? null}
        onClose={() => setSlash(null)}
      />
    </div>
  );
}
