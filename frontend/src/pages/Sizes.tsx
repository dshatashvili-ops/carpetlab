import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { useCanEdit } from '../session/SessionProvider';

interface Size { id: string; widthCm: number; lengthCm: number }

export function Sizes() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<Size[]>([]); const [w, setW] = useState(''); const [l, setL] = useState(''); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await apiFetch<Size[]>('/api/sizes')); } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось загрузить размеры'); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try { await apiFetch('/api/sizes', { method: 'POST', body: { widthCm: Number(w), lengthCm: Number(l) } }); setW(''); setL(''); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось добавить размер'); }
  }
  async function remove(id: string): Promise<void> {
    setError(null);
    try { await apiFetch(`/api/sizes/${id}`, { method: 'DELETE' }); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось удалить размер'); }
  }

  return (
    <div className="section">
      <h1>Шаблонные размеры ковров</h1>
      {canEdit && (
        <form className="cta" style={{ alignItems: 'end', marginBottom: 12 }} onSubmit={add} noValidate>
          <label className="field">Ширина, см<input type="number" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} /></label>
          <label className="field">Длина, см<input type="number" inputMode="numeric" value={l} onChange={(e) => setL(e.target.value)} /></label>
          <button className="btn" type="submit">Добавить</button>
        </form>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="table-scroll"><table className="data"><thead><tr><th>Размер, см</th><th /></tr></thead><tbody>
        {rows.map((s) => <tr key={s.id}><td className="num">{s.widthCm} × {s.lengthCm}</td><td>{canEdit && <button className="btn ghost" type="button" onClick={() => void remove(s.id)}>Удалить</button>}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={2} className="muted">Размеров пока нет. Добавьте те, которые вы режете чаще всего.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
