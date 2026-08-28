"use client";

import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Rich-text field for exam instructions (§2.3) — the only place in the app a
 * teacher/admin authors HTML rather than plain text. Uncontrolled internally
 * (Tiptap's own model owns keystrokes); `value` only seeds the editor once on
 * mount, `onChange` is the one-way sync back out via `editor.getHTML()`. The
 * server sanitizes on write (`apps/api/src/common/html/sanitize-html.ts`), so
 * this toolbar's restricted tag set is a UX constraint, not the security
 * boundary.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      // StarterKit bundles Link (and Underline) as of Tiptap v3 — disable its
      // copy so our own Link.configure() below doesn't collide with it
      // ("Duplicate extension names found: ['link']").
      StarterKit.configure({ heading: false, link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "min-h-[110px] px-3 py-2.5 text-sm text-admin-ink outline-none " +
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 " +
          "[&_a]:text-admin [&_a]:underline " +
          "[&_blockquote]:border-l-2 [&_blockquote]:border-admin-line [&_blockquote]:pl-3 [&_blockquote]:text-admin-muted " +
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-admin-subtle [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      },
    },
  });

  if (!editor) {
    return (
      <div className="min-h-[150px] animate-pulse rounded-lg border border-admin-line bg-admin-bg" />
    );
  }

  function setLink() {
    const previous = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      ?.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }

  return (
    <div className="rounded-lg border border-admin-line bg-white focus-within:border-admin">
      <div className="flex flex-wrap items-center gap-1 border-b border-admin-line/60 p-1.5">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          &bull;
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &ldquo;
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          🔗
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        >
          Tx
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-admin-line" />;
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded text-xs font-semibold ${
        active
          ? "bg-admin/15 text-admin"
          : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
      }`}
    >
      {children}
    </button>
  );
}
