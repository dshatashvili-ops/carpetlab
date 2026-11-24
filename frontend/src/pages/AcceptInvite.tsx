import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { useSession } from '../session/SessionProvider';

export function AcceptInvite() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const { refresh } = useSession();
  const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const token = params.get('token') ?? '';

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (password.length < 10) { setError('Пароль должен быть не короче 10 символов'); return; }
    setError(null); setBusy(true);
    try { await apiFetch('/api/auth/accept-invite', { method: 'POST', body: { token, password } }); await refresh(); navigate('/app'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось принять приглашение'); }
    finally { setBusy(false); }
  }
  return (
    <div className="section">
      <h1>Приглашение в CarpetLAB</h1>
      <p className="muted">Придумайте пароль. Если у вас уже есть кабинет, введите свой текущий пароль.</p>
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>Принять приглашение</button>
      </form>
    </div>
  );
}
