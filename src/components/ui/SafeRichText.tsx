"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

function stripInlineStyles(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const stripAttributes = (element: Element) => {
    element.removeAttribute("style");
    element.removeAttribute("bgcolor");
    element.removeAttribute("color");
    element.removeAttribute("face");
    element.removeAttribute("align");
    element.removeAttribute("width");
    element.removeAttribute("height");
    element.removeAttribute("border");
    element.removeAttribute("cellpadding");
    element.removeAttribute("cellspacing");
    element.removeAttribute("valign");
    element.removeAttribute("bg");

    Array.from(element.children).forEach((child) => stripAttributes(child));
  };

  document.body.querySelectorAll("*").forEach((element) => {
    stripAttributes(element);
  });

  return document.body.innerHTML;
}

interface SafeRichTextProps {
  html: string;
  className?: string;
}

export default function SafeRichText({ html, className }: SafeRichTextProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cleaned = stripInlineStyles(html || "");
    const safeHtml = DOMPurify.sanitize(cleaned, {
      USE_PROFILES: { html: true },
    });

    setSanitizedHtml(safeHtml);
  }, [html]);

  if (!sanitizedHtml) {
    return null;
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert text-gray-200 dark:text-gray-200 prose-strong:text-white prose-a:text-primary prose-a:no-underline prose-a:underline-offset-4 prose-strong:font-semibold prose-li:my-1",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
