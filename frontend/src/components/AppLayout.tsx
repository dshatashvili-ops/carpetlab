import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onSubscriptionExpired } from '../api/client';
import { Role, useSession } from '../session/SessionProvider';

const NAV: { to: string; label: string; roles?: Role[] }[] = [
  { to: '/app/articles', label: 'Артикулы' },
  { to: '/app/sizes', label: 'Размеры' },
  { to: '/app/stock', label: 'Склад' },
  { to: '/app/cutting', label: 'Раскрой' },
];

export function AppLayout() {
  const { user, subscription, logout, refresh } = useSession();
  const navigate = useNavigate();
  const [expiredNow, setExpiredNow] = useState(false);
  useEffect(() => onSubscriptionExpired(() => { setExpiredNow(true); void refresh(); }), [refresh]);
  const banner = subscription?.noticeBanner ?? (expiredNow ? { level: 'expired' as const, daysLeft: 0 } : null);

  return (
    <div className="app-shell">
      <aside className="app-side">
        <NavLink to="/" className="logo">Carpet<b>LAB</b></NavLink>
        <nav aria-label="Разделы кабинета">
          {NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role))).map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
        </nav>
        <button className="btn ghost" type="button" onClick={async () => { await logout(); navigate('/'); }}>Выйти</button>
      </aside>
      <div className="app-main">
        {banner && (
          <div className={`banner ${banner.level}`} role="status">
            {banner.level === 'expired'
              ? 'Подписка закончилась: данные доступны только для просмотра. '
              : `Подписка заканчивается через ${banner.daysLeft} дн. `}
            {user?.role === 'OWNER' && <NavLink to="/app/billing">Продлить</NavLink>}
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
