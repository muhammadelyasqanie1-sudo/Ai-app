export type ChatToolActivityStatus = 'running' | 'completed' | 'failed';

export interface ChatToolActivitySource {
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
}

/**
 * Safe, user-visible operational activity emitted by the existing /api/chat SSE stream.
 * This is intentionally not a second agent-task event system.
 */
export interface ChatToolActivity {
  id: string;
  requestId: string;
  name: string;
  label: string;
  detail?: string;
  url?: string;
  sources?: ChatToolActivitySource[];
  status: ChatToolActivityStatus;
  startedAt?: number;
  durationMs?: number;
  timestamp: number;
}
