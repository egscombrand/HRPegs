"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "./rich-text-editor.css";

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing...",
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          // Base styling
          "prose prose-sm sm:prose-base focus:outline-none min-h-[120px] p-4 w-full max-w-none mx-0",
          // Dark mode - text colors
          "dark:prose-invert",
          // Heading styles for dark mode
          "dark:prose-headings:text-foreground",
          "dark:prose-h1:text-lg dark:prose-h1:font-bold",
          "dark:prose-h2:text-base dark:prose-h2:font-bold",
          "dark:prose-h3:text-base dark:prose-h3:font-semibold",
          // Paragraph and text
          "dark:prose-p:text-foreground dark:prose-p:mb-2",
          "dark:prose-strong:text-foreground dark:prose-strong:font-bold",
          "dark:prose-em:text-foreground dark:prose-em:italic",
          // Lists
          "dark:prose-ol:text-foreground dark:prose-ul:text-foreground",
          "dark:prose-li:text-foreground dark:prose-li:marker:text-foreground",
          // Code and other elements
          "dark:prose-code:text-foreground dark:prose-code:bg-muted dark:prose-code:px-1.5 dark:prose-code:rounded",
          "dark:prose-blockquote:text-foreground dark:prose-blockquote:border-l-primary",
          "dark:prose-hr:border-border",
          // Remove default prose margins for better spacing
          "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-blockquote:my-2",
          "prose-h1:my-3 prose-h2:my-2 prose-h3:my-2",
        ),
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden dark:border-muted-foreground/30",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="border-b p-2 flex flex-wrap gap-1 bg-background dark:bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn("h-8 w-8 p-0", editor.isActive("bold") && "bg-muted")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn("h-8 w-8 p-0", editor.isActive("italic") && "bg-muted")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive("bulletList") && "bg-muted",
          )}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive("orderedList") && "bg-muted",
          )}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive({ textAlign: "left" }) && "bg-muted",
          )}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive({ textAlign: "center" }) && "bg-muted",
          )}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive({ textAlign: "right" }) && "bg-muted",
          )}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 w-8 p-0"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 w-8 p-0"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Content */}
      <div className="bg-background dark:bg-background min-h-[120px] w-full">
        <EditorContent editor={editor} className="rich-text-editor-content" />
      </div>
    </div>
  );
}
