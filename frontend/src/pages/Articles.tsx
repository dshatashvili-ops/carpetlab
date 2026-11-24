import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { useCanEdit } from '../session/SessionProvider';

export interface Article { id: string; code: string; name: string; rollWidthCm: number; cutMode: 'LINEAR' | 'ANY'; barcodeEnabled: boolean; photoKey?: string | null }
const MODES = { LINEAR: 'Линейная (только поперек)', ANY: 'Любая (можно и вдоль)' } as const;

function ArticleForm({ article, onDone, onCancel }: { article: Article | null; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(article?.code ?? ''); const [name, setName] = useState(article?.name ?? '');
  const [width, setWidth] = useState(article ? String(article.rollWidthCm) : ''); const [mode, setMode] = useState<'LINEAR' | 'ANY'>(article?.cutMode ?? 'LINEAR');
  const [barcode, setBarcode] = useState(article?.barcodeEnabled ?? false);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const body = { code: code.trim(), name: name.trim(), rollWidthCm: Number(width), cutMode: mode, barcodeEnabled: barcode };
      await (article ? apiFetch(`/api/articles/${article.id}`, { method: 'PATCH', body }) : apiFetch('/api/articles', { method: 'POST', body }));
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось сохранить артикул'); }
    finally { setBusy(false); }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !article) return;
    const form = new FormData(); form.append('file', file);
    try { await apiFetch(`/api/articles/${article.id}/photo`, { method: 'POST', body: form }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось загрузить фото'); }
  }

  return (
    <form className="stack panel" onSubmit={submit} noValidate aria-label="Карточка артикула">
      <label className="field">Артикул<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
      <label className="field">Название<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">Ширина рулона, см<input type="number" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} /></label>
      <label className="field">Режим резки
        <select value={mode} onChange={(e) => setMode(e.target.value as 'LINEAR' | 'ANY')}>{(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}</select>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={barcode} onChange={(e) => setBarcode(e.target.checked)} /> Штрихкод EAN-13 для готовых ковров</label>
      {article && <label className="field">Фото (JPEG, PNG, WebP, до 5 МБ)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="cta"><button className="btn" type="submit" disabled={busy}>Сохранить</button><button className="btn ghost" type="button" onClick={onCancel}>Отмена</button></div>
    </form>
  );
}

export function Articles() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<Article[]>([]); const [q, setQ] = useState(''); const [stock, setStock] = useState('all');
  const [editing, setEditing] = useState<Article | 'new' | null>(null); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams(); if (q) params.set('q', q); if (stock !== 'all') params.set('stock', stock);
    try { setRows(await apiFetch<Article[]>(`/api/articles${params.size ? `?${params}` : ''}`)); setError(null); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось загрузить артикулы'); }
  }, [q, stock]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="section">
      <h1>Артикулы</h1>
      <div className="cta" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label className="field">Поиск<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Код или название" /></label>
        <label className="field">Остатки
          <select value={stock} onChange={(e) => setStock(e.target.value)}>
            <option value="all">Все</option><option value="inStock">Есть остаток</option><option value="empty">Нет остатка</option>
          </select>
        </label>
        {canEdit && <button className="btn" type="button" onClick={() => setEditing('new')}>Новый артикул</button>}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {editing && <ArticleForm article={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>Артикул</th><th>Название</th><th>Ширина рулона</th><th>Резка</th><th>ШК</th><th /></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="num">{a.code}</td><td>{a.name}</td><td className="num">{a.rollWidthCm} см</td><td>{MODES[a.cutMode]}</td><td>{a.barcodeEnabled ? 'да' : 'нет'}</td>
                <td>{canEdit && <button className="btn ghost" type="button" onClick={() => setEditing(a)}>Изменить</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Артикулов нет. Добавьте первый, чтобы принять рулон.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
