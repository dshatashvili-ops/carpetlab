import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../api/client';

export type Role = 'OWNER' | 'OPERATOR' | 'CUTTER';
export interface SessionUser { userId: string; orgId: string; role: Role; emailVerified: boolean }
export interface SubscriptionInfo {
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED'; plan: number; expiresAt: string; daysLeft: number;
  noticeBanner: { level: 'info' | 'warning' | 'expired'; daysLeft: number } | null;
}
interface SessionValue {
  loading: boolean; user: SessionUser | null; subscription: SubscriptionInfo | null;
  refresh: () => Promise<void>; logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<SessionUser>('/api/auth/me');
      setUser(me);
      setSubscription(await apiFetch<SubscriptionInfo>('/api/subscription'));
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setUser(null); setSubscription(null);
    } finally { setLoading(false); }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null); setSubscription(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ loading, user, subscription, refresh, logout }), [loading, user, subscription, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/** Owners and operators may write, and only while the subscription is active (after it ends the cabinet is read-only). */
export function useCanEdit(): boolean {
  const { user, subscription } = useSession();
  return !!user && user.role !== 'CUTTER' && subscription?.status !== 'EXPIRED';
}
