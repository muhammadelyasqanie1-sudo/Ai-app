import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isStreaming }) => {
  return (
    <div className="space-y-3 leading-relaxed text-[15px] select-text afg-markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-lg font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 mb-1 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-cyan-500/60 pl-3 text-slate-300">{children}</blockquote>,
          table: ({ children }) => <div className="my-3 overflow-x-auto rounded-xl border border-slate-700"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-slate-700 bg-slate-800/80 px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-t border-slate-800 px-3 py-2 align-top">{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">{children}</a>,
          code: ({ className, children }) => <code className={className ? className + ' rounded bg-slate-900/70 px-1 py-0.5 font-mono text-[0.9em]' : 'rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.9em]'}>{children}</code>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" />}
    </div>
  );
};

const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const codeText = React.Children.toArray(children).map((child) => {
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return React.Children.toArray(child.props.children).map((part) => typeof part === 'string' ? part : '').join('');
    }
    return typeof child === 'string' ? child : '';
  }).join('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* Clipboard access may be unavailable in the current webview. */ }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-700/70 bg-[#0d1117] shadow-sm">
      <div className="flex items-center justify-end bg-slate-800/80 px-3 py-1.5">
        <button onClick={() => void handleCopy()} className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-4 text-[13px] leading-5">{children}</pre>
    </div>
  );
};
