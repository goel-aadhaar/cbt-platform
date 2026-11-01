"use client";

import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Placeholder } from "@tiptap/extensions";
import { DOMParser as SchemaParser } from "@tiptap/pm/model";
import {
  EditorContent,
  Extension,
  Node,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import {
  cleanPastedHtml,
  fromEditorHtml,
  plainTextToEditorHtml,
  toEditorHtml,
} from "@/lib/rich-text";

import { SymbolPicker } from "./symbol-picker";

/** One paragraph only: a question field is inline text with line breaks. */
const SingleParagraphDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "paragraph",
});

/**
 * Subscript and superscript cancel each other, as in Word. Done in the command
 * rather than with the marks' `excludes`: Tiptap refuses to set a mark that an
 * existing one excludes, which would leave the button dead on selected x².
 */
function toggleSubscript(editor: Editor) {
  return editor.chain().focus().unsetSuperscript().toggleSubscript().run();
}

function toggleSuperscript(editor: Editor) {
  return editor.chain().focus().unsetSubscript().toggleSuperscript().run();
}

const SubscriptMark = Subscript.extend({
  addKeyboardShortcuts() {
    return { "Mod-,": () => toggleSubscript(this.editor) };
  },
});

const SuperscriptMark = Superscript.extend({
  addKeyboardShortcuts() {
    return { "Mod-.": () => toggleSuperscript(this.editor) };
  },
});

/**
 * Editor for question text: the stem, each option and the explanation.
 *
 * Uncontrolled internally like `RichTextEditor`: `value` seeds the editor on
 * mount and `onChange` reports the stored form (see `fromEditorHtml`). A field
 * nobody types in never calls `onChange`, so opening and saving a question
 * leaves its text exactly as stored. The server sanitizes on write
 * (`sanitizeQuestionText`), so the marks allowed here are a UX constraint, not
 * the security boundary.
 *
 * Markdown-style input and paste rules are off: typing `*` or `_` in a question
 * or a `$…$` formula must leave those characters alone.
 */
export function QuestionTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  compact,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  ariaLabel: string;
  /** Single-line field with a smaller toolbar, for options. */
  compact?: boolean;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      SingleParagraphDocument,
      // Strike has no button, but stored text may carry `<s>` from an import.
      StarterKit.configure({
        document: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
      }),
      SubscriptMark,
      SuperscriptMark,
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: "questionTextKeys",
        priority: 1000,
        addKeyboardShortcuts() {
          const lineBreak = () =>
            compact ? true : this.editor.commands.setHardBreak();
          return {
            Enter: lineBreak,
            "Shift-Enter": lineBreak,
            "Mod-Enter": lineBreak,
          };
        },
      }),
    ],
    content: toEditorHtml(value),
    immediatelyRender: false,
    enableInputRules: false,
    enablePasteRules: false,
    onUpdate: ({ editor }) => onChange(fromEditorHtml(editor.getHTML())),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": ariaLabel,
        ...(compact ? {} : { "aria-multiline": "true" }),
        class:
          `${compact ? "min-h-[38px] py-2" : "min-h-[76px] py-2.5"} px-3 text-sm text-admin-ink outline-none ` +
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-admin-subtle [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      },
      /**
       * Paste goes through one path so Word, a PDF viewer, a web page and plain
       * text all end up as inline text and marks; the default would drop every
       * pasted paragraph after the first in a one-paragraph document.
       */
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");
        if (!html && !text) return false;
        const inline = html
          ? cleanPastedHtml(html, compact)
          : plainTextToEditorHtml(text ?? "", compact);
        const { body } = new DOMParser().parseFromString(inline, "text/html");
        const slice = SchemaParser.fromSchema(view.state.schema).parseSlice(
          body,
          { context: view.state.selection.$from, preserveWhitespace: !html },
        );
        view.dispatch(
          view.state.tr
            .replaceSelection(slice)
            .scrollIntoView()
            .setMeta("paste", true),
        );
        return true;
      },
    },
  });

  if (!editor) {
    return (
      <div
        className={`animate-pulse rounded-lg border border-admin-line bg-admin-bg ${
          compact ? "min-h-[72px]" : "min-h-[116px]"
        } ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      data-question-editor
      className={`rounded-lg border border-admin-line bg-white focus-within:border-admin ${className ?? ""}`}
    >
      <Toolbar editor={editor} compact={compact} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, compact }: { editor: Editor; compact?: boolean }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      subscript: editor.isActive("subscript"),
      superscript: editor.isActive("superscript"),
    }),
  });

  function insertSymbol(symbol: string, keepPanelFocus: boolean) {
    const chain = editor.chain();
    (keepPanelFocus ? chain : chain.focus())
      .command(({ tr }) => {
        tr.insertText(symbol);
        return true;
      })
      .run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-admin-line/60 p-1"
    >
      <ToolbarButton
        label="Bold"
        compact={compact}
        active={active.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        compact={compact}
        active={active.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        compact={compact}
        active={active.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-admin-line" />
      <ToolbarButton
        label="Subscript"
        compact={compact}
        active={active.subscript}
        onClick={() => toggleSubscript(editor)}
      >
        <span>
          x<sub>2</sub>
        </span>
      </ToolbarButton>
      <ToolbarButton
        label="Superscript"
        compact={compact}
        active={active.superscript}
        onClick={() => toggleSuperscript(editor)}
      >
        <span>
          x<sup>2</sup>
        </span>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-admin-line" />
      <SymbolPicker onInsert={insertSymbol} compact={compact} />
      <ToolbarButton
        label="Clear formatting"
        compact={compact}
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      >
        Tx
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  compact,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the author's selection: a click that moved focus would apply the
      // format to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex items-center justify-center rounded text-xs font-semibold ${
        compact ? "size-6" : "size-7"
      } ${
        active
          ? "bg-admin/15 text-admin"
          : "text-admin-muted hover:bg-admin-bg hover:text-admin-ink"
      }`}
    >
      {children}
    </button>
  );
}
