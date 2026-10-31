import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { parseMarkdownBlocks, type MarkdownBlock } from '../utils/chatLogic';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isStreaming }) => {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-3 leading-relaxed text-[15px] select-text">
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return <CodeBlock key={idx} code={block.content} lang={block.lang} />;
        }
        if (block.type === 'heading') {
          return <HeadingBlock key={idx} level={block.level || 2} text={block.content} />;
        }
        return <ParagraphBlock key={idx} text={block.content} isLast={idx === blocks.length - 1 && isStreaming} />;
      })}
    </div>
  );
};

const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = 'text' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-neutral-700/60 bg-[#1e1e1e] text-neutral-100 font-mono text-[13px] shadow-sm">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#2d2d2d] text-neutral-400 text-xs select-none">
        <span className="font-sans lowercase">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-neutral-700/60 text-neutral-300 transition-colors cursor-pointer"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="m-0 leading-5">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

const HeadingBlock: React.FC<{ level: number; text: string }> = ({ level, text }) => {
  if (level === 1) {
    return <h1 className="text-xl font-bold mt-4 mb-2 text-inherit">{text}</h1>;
  }
  if (level === 2) {
    return <h2 className="text-lg font-semibold mt-3 mb-1.5 text-inherit">{text}</h2>;
  }
  return <h3 className="text-base font-semibold mt-2 mb-1 text-inherit">{text}</h3>;
};

const ParagraphBlock: React.FC<{ text: string; isLast?: boolean }> = ({ text, isLast }) => {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={lIdx} className="flex items-start gap-2 pl-2">
              <span className="text-neutral-400 select-none">•</span>
              <span className="flex-1">{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered list item
        const matchNum = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (matchNum) {
          return (
            <div key={lIdx} className="flex items-start gap-2 pl-2">
              <span className="text-neutral-400 select-none font-medium">{matchNum[1]}.</span>
              <span className="flex-1">{renderInline(matchNum[2])}</span>
            </div>
          );
        }

        if (!trimmed) {
          return <div key={lIdx} className="h-2" />;
        }

        return (
          <p key={lIdx} className="m-0">
            {renderInline(line)}
            {isLast && lIdx === lines.length - 1 && <span className="streaming-cursor" />}
          </p>
        );
      })}
    </div>
  );
};

function renderInline(text: string): React.ReactNode {
  // Simple token parser for **bold**, *italic*, and `inline code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.*?)\*\*(.*)$/);
    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);

    if (codeMatch && (!boldMatch || codeMatch[1].length <= boldMatch[1].length)) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-pink-600 dark:text-pink-400 font-mono text-[13px]"
        >
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(
        <strong key={key++} className="font-semibold text-inherit">
          {boldMatch[2]}
        </strong>
      );
      remaining = boldMatch[3];
      continue;
    }

    // No more formatting matches
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts;
}
