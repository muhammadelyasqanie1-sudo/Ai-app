/**
 * The "Tools" hub. Every functional capability lives here so the main UI stays clean.
 * Cards open the matching view; the last card groups Files and Providers.
 */

import { Bot, Cloud, Folder, Image as ImageIcon, Plug, Terminal, WifiOff } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import type { View } from '../types';

interface ToolItem {
  title: string;
  fa: string;
  description: string;
  icon: typeof Bot;
  actions: { label: string; view: View }[];
}

const TOOLS: ToolItem[] = [
  {
    title: 'Code Chat & AI Assistant',
    fa: 'چت کد و دستیار هوشمند',
    description: 'Ask, generate and debug code.',
    icon: Bot,
    actions: [{ label: 'Open chat', view: 'chat' }],
  },
  {
    title: 'Offline Mode',
    fa: 'چت آفلاین',
    description: 'Chat with an on-device model.',
    icon: WifiOff,
    actions: [{ label: 'Open', view: 'offline' }],
  },
  {
    title: 'Terminal',
    fa: 'ترمینال',
    description: 'Run commands in your workspace.',
    icon: Terminal,
    actions: [{ label: 'Open', view: 'terminal' }],
  },
  {
    title: 'Image & Video Generation',
    fa: 'تولید عکس/ویدیو',
    description: 'Create images and short videos.',
    icon: ImageIcon,
    actions: [{ label: 'Open', view: 'media' }],
  },
  {
    title: 'File Management & Providers',
    fa: 'مدیریت فایل و ارائه‌دهندگان',
    description: 'Browse project files and manage AI providers.',
    icon: Cloud,
    actions: [
      { label: 'Files', view: 'files' },
      { label: 'Providers', view: 'providers' },
    ],
  },
];

export default function ToolsMenu() {
  const { setView } = useWorkspace();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h2 className="text-lg font-semibold tracking-tight">Tools</h2>
        <p className="mt-1 text-sm text-slate-500">Everything the assistant can do, in one place.</p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {TOOLS.map(({ title, fa, description, icon: Icon, actions }) => (
            <li key={title} className="ws-fade-in rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400" dir="rtl">
                    {fa}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-500">{description}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => setView(a.view)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
