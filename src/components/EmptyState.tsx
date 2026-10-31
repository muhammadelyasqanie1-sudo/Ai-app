import React from 'react';
import { Image, FileText, Code2, Lightbulb, PenTool, BarChart3 } from 'lucide-react';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Lightbulb,
    title: 'Brainstorm ideas',
    description: 'for a new sustainable product or startup',
    prompt: 'Brainstorm 5 innovative startup ideas focused on green energy and sustainability.',
    color: 'text-amber-500',
  },
  {
    icon: Code2,
    title: 'Code a solution',
    description: 'in Python or TypeScript with explanations',
    prompt: 'Write a TypeScript function that efficiently deduplicates an array of objects based on an id key, with unit tests.',
    color: 'text-blue-500',
  },
  {
    icon: FileText,
    title: 'Summarize text',
    description: 'breakdown complex topics simply',
    prompt: 'Explain quantum computing in simple terms with an analogy anyone can understand.',
    color: 'text-emerald-500',
  },
  {
    icon: PenTool,
    title: 'Help me write',
    description: 'a polite and persuasive professional email',
    prompt: 'Help me draft a professional yet warm follow-up email after an executive job interview.',
    color: 'text-purple-500',
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto px-4 py-8 select-none">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100 text-center mb-8">
        What can I help with today?
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {SUGGESTIONS.map((item, idx) => {
          const IconComponent = item.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex items-start gap-3.5 p-3.5 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white/60 dark:bg-neutral-800/40 hover:bg-neutral-100/80 dark:hover:bg-neutral-800 transition-all text-left shadow-2xs hover:shadow-xs group cursor-pointer"
              aria-label={`Prompt suggestion: ${item.title}`}
            >
              <div className={`p-2 rounded-xl bg-neutral-100 dark:bg-neutral-700/60 ${item.color} mt-0.5`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {item.title}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
