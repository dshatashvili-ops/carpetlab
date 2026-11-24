import { useSession } from '../session/SessionProvider';

export function AppHome() {
  const { user, subscription } = useSession();
  return (
    <div className="section">
      <h1>Кабинет</h1>
      <p className="muted">Роль: {user?.role}. Подписка: {subscription?.status}{subscription ? `, осталось дней: ${subscription.daysLeft}` : ''}.</p>
    </div>
  );
}
