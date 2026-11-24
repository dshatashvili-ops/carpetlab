import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { useSession } from '../session/SessionProvider';

export function Register() {
  const [email, setEmail] = useState(''); const [orgName, setOrgName] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const session = useSessionSafe();

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (password.length < 10) { setError('Пароль должен быть не короче 10 символов'); return; }
    setError(null); setBusy(true);
    try {
      await apiFetch('/api/auth/register', { method: 'POST', body: { email, password, orgName } });
      await session?.refresh();
      navigate('/app');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось зарегистрироваться'); }
    finally { setBusy(false); }
  }

  return (
    <div className="section">
      <h1>Регистрация</h1>
      <p className="muted">7 дней бесплатно, без карты. Потом данные останутся, а редактирование откроется после оплаты.</p>
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label className="field">Название организации<input value={orgName} onChange={(e) => setOrgName(e.target.value)} required /></label>
        <label className="field">Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>Начать пробный период</button>
        <span className="muted">Уже есть кабинет? <Link to="/login">Войти</Link></span>
      </form>
    </div>
  );
}

/** Register can be rendered in isolation (tests, previews) without a SessionProvider. */
function useSessionSafe(): ReturnType<typeof useSession> | null {
  try { return useSession(); } catch { return null; }
}
