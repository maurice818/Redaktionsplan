"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Underline, Undo2, Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rich-Text-Editor für Magazinartikel. Schreibt das HTML in ein verstecktes
 * Formularfeld; der Server bereinigt es vor dem Speichern (sanitize-html).
 */
export function RichTextEditor({ name, defaultValue, placeholder = "Artikeltext …", readOnly = false }: { name: string; defaultValue: string; placeholder?: string; readOnly?: boolean }) {
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"], HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
        codeBlock: false,
        code: false,
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class: "prose-mg tiptap min-h-[22rem] px-4 py-3 text-[15px] focus:outline-none",
        "aria-label": "Artikeltext",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor?.isActive("bold") ?? false,
      italic: ctx.editor?.isActive("italic") ?? false,
      underline: ctx.editor?.isActive("underline") ?? false,
      strike: ctx.editor?.isActive("strike") ?? false,
      h2: ctx.editor?.isActive("heading", { level: 2 }) ?? false,
      h3: ctx.editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: ctx.editor?.isActive("bulletList") ?? false,
      ordered: ctx.editor?.isActive("orderedList") ?? false,
      quote: ctx.editor?.isActive("blockquote") ?? false,
      link: ctx.editor?.isActive("link") ?? false,
      words: ctx.editor?.storage.characterCount?.words() ?? 0,
      chars: ctx.editor?.storage.characterCount?.characters() ?? 0,
    }),
  });

  const btn = (active: boolean | undefined, label: string, onClick: () => void, Icon: typeof Bold) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={readOnly}
      className={cn("grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40", active && "bg-[#f4ecf1] text-[#6f2659]")}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link-Adresse (https://…)", previous ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-white focus-within:border-[#b90845] focus-within:ring-3 focus-within:ring-[#b90845]/15">
      <input type="hidden" name={name} value={html} />
      <div role="toolbar" aria-label="Formatierung" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        {btn(state?.h2, "Zwischenüberschrift", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
        {btn(state?.h3, "Unterüberschrift", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {btn(state?.bold, "Fett", () => editor?.chain().focus().toggleBold().run(), Bold)}
        {btn(state?.italic, "Kursiv", () => editor?.chain().focus().toggleItalic().run(), Italic)}
        {btn(state?.underline, "Unterstrichen", () => editor?.chain().focus().toggleUnderline().run(), Underline)}
        {btn(state?.strike, "Durchgestrichen", () => editor?.chain().focus().toggleStrike().run(), Strikethrough)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {btn(state?.bullet, "Aufzählung", () => editor?.chain().focus().toggleBulletList().run(), List)}
        {btn(state?.ordered, "Nummerierte Liste", () => editor?.chain().focus().toggleOrderedList().run(), ListOrdered)}
        {btn(state?.quote, "Zitat", () => editor?.chain().focus().toggleBlockquote().run(), Quote)}
        {btn(false, "Trennlinie", () => editor?.chain().focus().setHorizontalRule().run(), Minus)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {btn(state?.link, "Link einfügen", setLink, Link2)}
        {btn(false, "Link entfernen", () => editor?.chain().focus().unsetLink().run(), Unlink)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {btn(false, "Rückgängig", () => editor?.chain().focus().undo().run(), Undo2)}
        {btn(false, "Wiederholen", () => editor?.chain().focus().redo().run(), Redo2)}
        <span className="ml-auto px-2 text-[11px] text-muted-foreground tabular-nums">{state?.words ?? 0} Wörter · {state?.chars ?? 0} Zeichen</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
