import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { useSession } from '../session/SessionProvider';

export function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const { refresh } = useSession();

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
      await refresh();
      navigate('/app');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось войти'); }
    finally { setBusy(false); }
  }

  return (
    <div className="section">
      <h1>Вход</h1>
      <form className="stack" onSubmit={submit}>
        <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label className="field">Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>Войти</button>
        <span className="muted">Нет кабинета? <Link to="/register">Зарегистрироваться</Link></span>
      </form>
    </div>
  );
}
