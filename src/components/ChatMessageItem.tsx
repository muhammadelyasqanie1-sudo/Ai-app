import React, { useState } from 'react';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronRight,
  Brain,
  Edit3,
} from 'lucide-react';
import { OpenAiLogo } from './OpenAiLogo';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { Message } from '../utils/chatLogic';

interface ChatMessageItemProps {
  message: Message;
  isLastAssistant: boolean;
  onRegenerate?: () => void;
  onEditUserMessage?: (newText: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isLastAssistant,
  onRegenerate,
  onEditUserMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [showReasoning, setShowReasoning] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleSpeech = () => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content.replace(/[#*`_]/g, ''));
    utterance.rate = 1.05;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end my-4 px-4">
        <div className="max-w-[85%] md:max-w-[70%] group relative">
          {isEditing ? (
            <div className="p-3 rounded-2xl bg-neutral-100 dark:bg-[#2f2f2f] border border-neutral-300 dark:border-neutral-700 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-sm text-neutral-800 dark:text-neutral-100 resize-none font-sans"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editText.trim() && onEditUserMessage) {
                      onEditUserMessage(editText.trim());
                    }
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium hover:opacity-90 cursor-pointer"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditText(message.content);
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                aria-label="Edit message"
                title="Edit message"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <div className="px-4 py-2.5 rounded-3xl bg-[#f4f4f4] dark:bg-[#2f2f2f] text-neutral-900 dark:text-neutral-100 text-[15px] leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 my-6 px-4 max-w-3xl mx-auto w-full group">
      {/* Assistant avatar */}
      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
        <OpenAiLogo size={18} />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Thinking / Reasoning Dropdown (if present) */}
        {message.reasoning && (
          <div className="mb-3 rounded-xl border border-neutral-200 dark:border-neutral-850 bg-neutral-50 dark:bg-[#1a1a1a] overflow-hidden text-xs">
            <button
              onClick={() => setShowReasoning((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Toggle reasoning steps"
            >
              <div className="flex items-center gap-2 font-medium">
                <Brain className="w-3.5 h-3.5 text-purple-500" />
                <span>Thought for 3 seconds</span>
              </div>
              {showReasoning ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {showReasoning && (
              <div className="px-3 pb-3 text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 pt-2 font-mono text-[12px] whitespace-pre-wrap leading-relaxed">
                {message.reasoning}
              </div>
            )}
          </div>
        )}

        {/* Message body */}
        <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />

        {/* Action toolbar */}
        {!message.isStreaming && (
          <div className="flex items-center gap-1 pt-2 text-neutral-400">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              aria-label="Copy response"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={handleSpeech}
              className={`p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer ${
                isSpeaking ? 'text-emerald-500' : ''
              }`}
              aria-label="Read response aloud"
              title={isSpeaking ? 'Stop speech' : 'Read aloud'}
            >
              {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setLiked(liked === true ? null : true)}
              className={`p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                liked === true
                  ? 'text-emerald-500'
                  : 'hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              aria-label="Good response"
              title="Good response"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>

            <button
              onClick={() => setLiked(liked === false ? null : false)}
              className={`p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                liked === false
                  ? 'text-rose-500'
                  : 'hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              aria-label="Bad response"
              title="Bad response"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>

            {isLastAssistant && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
