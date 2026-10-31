import React, { useState } from 'react';
import { X, Copy, Check, Globe, Lock } from 'lucide-react';
import type { Conversation } from '../utils/chatLogic';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, conversation }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !conversation) return null;

  const shareUrl = `${window.location.origin}/share/${conversation.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#212121] text-neutral-800 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          aria-label="Close share dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 id="share-dialog-title" className="text-base font-semibold">Share link to Chat</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Anyone with this link will be able to view this chat
            </p>
          </div>
        </div>

        {/* Chat snippet preview */}
        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-[#171717] border border-neutral-200 dark:border-neutral-800 space-y-1">
          <div className="text-xs font-semibold truncate">{conversation.title}</div>
          <div className="text-[11px] text-neutral-400">
            {conversation.messages.length} messages • Created {new Date(conversation.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Link box */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-neutral-100 dark:bg-[#171717] border border-neutral-300 dark:border-neutral-700">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent border-none outline-none text-xs px-2 text-neutral-600 dark:text-neutral-300 font-mono"
            aria-label="Public share link"
          />
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
