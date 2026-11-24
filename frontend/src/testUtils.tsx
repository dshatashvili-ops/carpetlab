import { render } from '@testing-library/react';
import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from './session/SessionProvider';

type Handler = unknown | ((init: { method: string; body: unknown }) => unknown);

/** Replaces fetch: handlers are matched by "METHOD /path" (query ignored); unmatched requests answer 404. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const key = `${method} ${url.split('?')[0]}`;
    if (!(key in handlers)) return { ok: false, status: 404, json: async () => ({ message: 'not mocked' }), text: async () => '' };
    const h = handlers[key];
    const data = typeof h === 'function' ? (h as (i: unknown) => unknown)({ method, body }) : h;
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  }) as unknown as typeof fetch;
  return calls;
}

export const ME = { userId: 'u1', orgId: 'o1', role: 'OWNER', emailVerified: true };
export const SUB = { status: 'TRIAL', plan: 1, expiresAt: '2030-01-01T00:00:00Z', daysLeft: 7, noticeBanner: null };
export const sessionHandlers = (role = 'OWNER', sub: object = SUB): Record<string, Handler> => ({
  'GET /api/auth/me': { ...ME, role }, 'GET /api/subscription': sub,
});

export function renderWithSession(ui: ReactElement, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}><SessionProvider>{ui}</SessionProvider></MemoryRouter>);
}
