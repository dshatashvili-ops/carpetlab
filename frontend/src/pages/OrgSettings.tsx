import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { useSession } from '../session/SessionProvider';

interface Settings { name: string; gsPrefix: string | null; minRemnantSideCm: number; labelWidthMm: number; labelHeightMm: number }

export function OrgSettings() {
  const { user } = useSession();
  const [prefix, setPrefix] = useState(''); const [min, setMin] = useState(''); const [lw, setLw] = useState(''); const [lh, setLh] = useState('');
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState<string | null>(null);
  const apply = (s: Settings): void => { setPrefix(s.gsPrefix ?? ''); setMin(String(s.minRemnantSideCm)); setLw(String(s.labelWidthMm)); setLh(String(s.labelHeightMm)); };
  useEffect(() => { apiFetch<Settings>('/api/org/settings').then(apply).catch(() => setError('Не удалось загрузить настройки')); }, []);
  const fail = (e: unknown, fallback: string): void => { setSaved(null); setError(e instanceof ApiError ? e.message : fallback); };

  async function savePrefix(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setSaved(null);
    try { await apiFetch('/api/org/gs-prefix', { method: 'PUT', body: { prefix } }); setSaved('Префикс сохранен'); } catch (err) { fail(err, 'Не удалось сохранить префикс'); }
  }
  async function saveSettings(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setSaved(null);
    try { apply(await apiFetch<Settings>('/api/org/settings', { method: 'PATCH', body: { minRemnantSideCm: Number(min), labelWidthMm: Number(lw), labelHeightMm: Number(lh) } })); setSaved('Настройки сохранены'); }
    catch (err) { fail(err, 'Не удалось сохранить настройки'); }
  }

  if (user && user.role !== 'OWNER') return <div className="section"><p>Настройки доступны владельцу организации.</p></div>;
  return (
    <div className="section" style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>Настройки</h1>
      {error && <div className="error" role="alert">{error}</div>}
      {saved && <div role="status" style={{ color: 'var(--ok)' }}>{saved}</div>}
      <form className="stack panel" onSubmit={savePrefix} noValidate>
        <h2 style={{ margin: 0 }}>Штрихкоды EAN-13</h2>
        <label className="field">Префикс GS1<input className="num" inputMode="numeric" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="7–9 цифр" /></label>
        <span className="muted">Префикс выдает GS1: регистрация в GS1 на вашей стороне. Сервис не проверяет, что префикс принадлежит вам. После выдачи первых штрихкодов префикс менять нельзя.</span>
        <button className="btn" type="submit">Сохранить префикс</button>
      </form>
      <form className="stack panel" onSubmit={saveSettings} noValidate>
        <h2 style={{ margin: 0 }}>Раскрой и этикетки</h2>
        <label className="field">Минимальная сторона обрезка, см<input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></label>
        <span className="muted">Остаток с меньшей стороной считается отходом и не сохраняется как обрезок.</span>
        <label className="field">Ширина этикетки, мм<input type="number" value={lw} onChange={(e) => setLw(e.target.value)} /></label>
        <label className="field">Высота этикетки, мм<input type="number" value={lh} onChange={(e) => setLh(e.target.value)} /></label>
        <button className="btn" type="submit">Сохранить настройки</button>
      </form>
    </div>
  );
}
