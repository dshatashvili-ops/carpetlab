import { ApiError, apiFetch, onSubscriptionExpired, setUnauthorizedHandler } from './client';

const mockFetch = (status: number, body: unknown): void => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as typeof fetch;
};

describe('apiFetch', () => {
  afterEach(() => { setUnauthorizedHandler(null); vi.restoreAllMocks(); });

  it('returns parsed JSON and sends cookies', async () => {
    mockFetch(200, { ok: true });
    await expect(apiFetch('/api/x')).resolves.toEqual({ ok: true });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('calls the unauthorized handler on 401 and throws an ApiError', async () => {
    const handler = vi.fn(); setUnauthorizedHandler(handler);
    mockFetch(401, { message: 'Требуется вход' });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 401, message: 'Требуется вход' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed login (401 on /api/auth/login) as an expired session', async () => {
    const handler = vi.fn(); setUnauthorizedHandler(handler);
    mockFetch(401, { message: 'Неверный e-mail или пароль' });
    await expect(apiFetch('/api/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('announces an expired subscription on 402', async () => {
    const listener = vi.fn(); const off = onSubscriptionExpired(listener);
    mockFetch(402, { code: 'SUBSCRIPTION_EXPIRED', message: 'Подписка закончилась' });
    await expect(apiFetch('/api/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 402, code: 'SUBSCRIPTION_EXPIRED' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('serializes an object body as JSON', async () => {
    mockFetch(201, {});
    await apiFetch('/api/x', { method: 'POST', body: { a: 1 } });
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });
});
