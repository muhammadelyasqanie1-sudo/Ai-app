"use client";

import React, { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className || "")?.[1] || "code";

  const copy = async () => {
    const el = document.getElementById("afg-code-copy-target");
    // Extract plain text from the React node via a temporary element
    const container = document.createElement("div");
    container.innerHTML = "";
    const text = extractText(children);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="my-3 rounded-lg border bg-muted/60 overflow-hidden" dir="ltr">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/80">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={copy} aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="ms-1">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <pre className="afg-scroll"><code className={className}>{children}</code></pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as { props?: unknown })) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="afg-prose text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            if (className?.includes("language-")) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return <code {...props}>{children}</code>;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
