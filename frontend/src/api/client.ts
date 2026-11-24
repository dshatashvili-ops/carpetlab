export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (h: (() => void) | null): void => { unauthorizedHandler = h; };

const expiredListeners = new Set<() => void>();
/** Subscribe to "subscription ended" (HTTP 402). Returns an unsubscribe function. */
export function onSubscriptionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) body = init.body;
  else if (init.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.body); }

  const res = await fetch(path, { method: init.method ?? 'GET', headers, body, credentials: 'include' });
  if (res.status === 204) return undefined as T;

  let data: { message?: string | string[]; code?: string } & Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) unauthorizedHandler?.();
    if (res.status === 402) expiredListeners.forEach((l) => l());
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new ApiError(res.status, message ?? 'Не удалось выполнить запрос', data.code);
  }
  return data as T;
}
