import React from 'react';
import { X, Sparkles, Image, Code, PenTool, Database, BookOpen, Compass } from 'lucide-react';

interface ExploreGptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGpt: (name: string, initialPrompt: string) => void;
}

const FEATURED_GPTS = [
  {
    name: 'DALL·E',
    tagline: 'Transform your ideas into astonishing visual images and concepts.',
    by: 'ChatGPT',
    icon: Image,
    color: 'from-amber-400 to-orange-500',
    starterPrompt: 'Create a vibrant cinematic illustration of a futuristic city nestled in a lush green valley.',
  },
  {
    name: 'Code Copilot',
    tagline: 'Write, debug, and optimize code across TypeScript, Python, Rust, and SQL.',
    by: 'ChatGPT',
    icon: Code,
    color: 'from-blue-500 to-indigo-600',
    starterPrompt: 'Help me design a robust rate-limiter algorithm with sliding window in TypeScript.',
  },
  {
    name: 'Writing Coach',
    tagline: 'Refine your prose, essays, pitches, and communications with editor feedback.',
    by: 'ChatGPT',
    icon: PenTool,
    color: 'from-emerald-400 to-teal-600',
    starterPrompt: 'Review this paragraph and make it sharper, more persuasive, and emotionally resonant:',
  },
  {
    name: 'Data Analyst',
    tagline: 'Analyze spreadsheets, compute metrics, and visualize complex datasets.',
    by: 'ChatGPT',
    icon: Database,
    color: 'from-purple-500 to-pink-600',
    starterPrompt: 'What are the best metrics to measure cohort retention for a SaaS product?',
  },
  {
    name: 'Tech Tutor',
    tagline: 'Master complex engineering, algorithms, and system architecture step-by-step.',
    by: 'ChatGPT',
    icon: BookOpen,
    color: 'from-rose-500 to-red-600',
    starterPrompt: 'Explain how distributed consensus works in Raft and Paxos with clear diagrams and examples.',
  },
];

export const ExploreGptsModal: React.FC<ExploreGptsModalProps> = ({
  isOpen,
  onClose,
  onSelectGpt,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="explore-dialog-title"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#212121] text-neutral-800 dark:text-neutral-100 rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <Compass className="w-6 h-6 text-emerald-500" />
          <h2 id="explore-dialog-title" className="text-xl font-semibold">Explore GPTs</h2>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
          Discover and create custom versions of ChatGPT that combine instructions, extra knowledge, and any combination of skills.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURED_GPTS.map((gpt, idx) => {
            const Icon = gpt.icon;
            return (
              <button
                key={idx}
                onClick={() => {
                  onSelectGpt(gpt.name, gpt.starterPrompt);
                  onClose();
                }}
                className="flex items-start gap-3.5 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-all text-left group cursor-pointer shadow-2xs"
                aria-label={`Start chat with ${gpt.name}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${gpt.color} text-white flex items-center justify-center shrink-0 shadow-sm`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {gpt.name}
                  </div>
                  <div className="text-[11px] text-neutral-400 font-medium">By {gpt.by}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                    {gpt.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
