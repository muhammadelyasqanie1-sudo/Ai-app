import { ApiErrorSchema } from '../../packages/shared/src/schemas';

export class ApiClientError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly code?: string;
  constructor(message: string, status: number, requestId?: string, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

export async function toApiError(response: Response): Promise<ApiClientError> {
  let payload: unknown;
  try { payload = await response.clone().json(); } catch { payload = null; }
  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiClientError(parsed.data.error, response.status, parsed.data.requestId, parsed.data.code);
  }
  return new ApiClientError(
    response.status >= 500 ? 'The service is temporarily unavailable. Please try again.' : 'The request could not be completed.',
    response.status,
    response.headers.get('X-Request-Id') || undefined,
  );
}
