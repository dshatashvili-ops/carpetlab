import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { Role, useSession } from '../session/SessionProvider';

interface Member { id: string; userId: string; email: string; role: Role }
interface Invite { email: string; role: Role | null }
const ROLE_LABEL: Record<Role, string> = { OWNER: 'Владелец', OPERATOR: 'Оператор', CUTTER: 'Раскройщик' };
const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function Employees() {
  const { user } = useSession();
  const [members, setMembers] = useState<Member[]>([]); const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState(''); const [role, setRole] = useState<Role>('OPERATOR'); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const r = await apiFetch<{ members: Member[]; pendingInvites: Invite[] }>('/api/employees'); setMembers(r.members); setInvites(r.pendingInvites); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось загрузить сотрудников'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const fail = (e: unknown, fallback: string): void => setError(e instanceof ApiError ? e.message : fallback);

  async function invite(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try { await apiFetch('/api/employees', { method: 'POST', body: { email, role } }); setEmail(''); await load(); } catch (err) { fail(err, 'Не удалось отправить приглашение'); }
  }
  async function changeRole(id: string, next: Role): Promise<void> {
    setError(null); try { await apiFetch(`/api/employees/${id}`, { method: 'PATCH', body: { role: next } }); await load(); } catch (err) { fail(err, 'Не удалось изменить роль'); }
  }
  async function remove(id: string): Promise<void> {
    setError(null); try { await apiFetch(`/api/employees/${id}`, { method: 'DELETE' }); await load(); } catch (err) { fail(err, 'Не удалось убрать сотрудника'); }
  }

  if (user && user.role !== 'OWNER') return <div className="section"><p>Сотрудниками управляет владелец организации.</p></div>;
  return (
    <div className="section" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Сотрудники</h1>
      <form className="cta" style={{ alignItems: 'end' }} onSubmit={invite} noValidate>
        <label className="field">E-mail сотрудника<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Роль<select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <button className="btn" type="submit">Пригласить</button>
      </form>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="table-scroll"><table className="data"><thead><tr><th>E-mail</th><th>Роль</th><th /></tr></thead><tbody>
        {members.map((m) => (
          <tr key={m.id}><td>{m.email}</td>
            <td><select aria-label={`Роль ${m.email}`} value={m.role} onChange={(e) => void changeRole(m.id, e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
            <td><button className="btn ghost" type="button" onClick={() => void remove(m.id)}>Убрать</button></td></tr>
        ))}
        {invites.map((i) => <tr key={i.email}><td className="muted">{i.email} (ожидает ответа)</td><td className="muted">{i.role ? ROLE_LABEL[i.role] : ''}</td><td /></tr>)}
      </tbody></table></div>
      <p className="muted">Владелец управляет подпиской и сотрудниками; оператор ведет склад и раскрой; раскройщик смотрит документы и печатает спецификации.</p>
    </div>
  );
}
