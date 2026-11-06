import { ChatRequestSchema, type SharedChatRequest } from '../../packages/shared/src/schemas';
import { toApiError } from './apiErrors';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || ((import.meta as any).env?.MODE === 'production' ? 'https://afgai-production-fdfd.up.railway.app' : '')).replace(/\/$/, '');

export function apiUrl(path: string): string {
  return API_BASE_URL + (path.startsWith('/') ? path : '/' + path);
}


export function getCsrfToken(): string {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length);
  if (cookie) { try { return decodeURIComponent(cookie); } catch { return cookie; } }
  return sessionStorage.getItem('afg_csrf_token') || '';
}
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: init.credentials || 'include' });
  if (!response.ok) throw await toApiError(response);
  return response;
}

/** Validated transport for the shared chat contract; returns the raw response for SSE streaming. */
export async function postChat(input: SharedChatRequest, signal?: AbortSignal): Promise<Response> {
  const parsed = ChatRequestSchema.safeParse(input);
  if (!parsed.success) throw new TypeError('Invalid chat request payload.');
  return apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    signal,
  });
}
