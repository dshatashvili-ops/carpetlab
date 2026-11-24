import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { formatM2 } from '../format';
import { useCanEdit } from '../session/SessionProvider';
import type { Article } from './Articles';
import { AdjustForm, ReceiveRollForm } from './stockForms';

interface MaterialRow { id: string; kind: 'ROLL' | 'REMNANT'; widthCm: number; lengthCm: number; qty: number; areaM2: number }
interface CarpetRow { skuId: string; articleCode: string; articleName: string; widthCm: number; lengthCm: number; ean13: string | null; qty: number }
interface Move { id: string; kind: string; qtyDelta: number; reason: string | null; userEmail: string | null; createdAt: string }
const KIND: Record<string, string> = { RECEIPT: 'Приход', CUT_CONSUME: 'Раскрой: списание', CUT_OUTPUT: 'Раскрой: готовые ковры', MANUAL_WRITE_OFF: 'Списание', MANUAL_RECEIPT: 'Оприходование', EDIT_REVERSAL: 'Правка документа' };

export function Stock() {
  const canEdit = useCanEdit();
  const [articles, setArticles] = useState<Article[]>([]); const [articleId, setArticleId] = useState('');
  const [materials, setMaterials] = useState<MaterialRow[]>([]); const [carpets, setCarpets] = useState<CarpetRow[]>([]); const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState<{ type: 'MATERIAL' | 'CARPET'; id: string } | null>(null);
  const [history, setHistory] = useState<Move[] | null>(null); const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown, fallback: string): void => setError(e instanceof ApiError ? e.message : fallback);

  useEffect(() => { apiFetch<Article[]>('/api/articles').then(setArticles).catch((e) => fail(e, 'Не удалось загрузить артикулы')); }, []);
  const loadMaterials = useCallback(async () => {
    if (!articleId) { setMaterials([]); return; }
    try { setMaterials(await apiFetch<MaterialRow[]>(`/api/stock/materials?articleId=${articleId}`)); } catch (e) { fail(e, 'Не удалось загрузить остатки'); }
  }, [articleId]);
  const loadCarpets = useCallback(async () => {
    const p = new URLSearchParams(); if (articleId) p.set('articleId', articleId); if (/^\d{13}$/.test(q)) p.set('ean', q); else if (q) p.set('q', q);
    try { setCarpets(await apiFetch<CarpetRow[]>(`/api/stock/carpets${p.size ? `?${p}` : ''}`)); } catch (e) { fail(e, 'Не удалось загрузить готовые ковры'); }
  }, [articleId, q]);
  useEffect(() => { void loadMaterials(); }, [loadMaterials]);
  useEffect(() => { void loadCarpets(); }, [loadCarpets]);
  const refresh = (): void => { setAdjust(null); void loadMaterials(); void loadCarpets(); };
  const article = articles.find((a) => a.id === articleId);

  async function showHistory(itemId: string): Promise<void> {
    try { setHistory(await apiFetch<Move[]>(`/api/stock/history?itemId=${itemId}`)); } catch (e) { fail(e, 'Не удалось загрузить историю'); }
  }

  return (
    <div className="section" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Склад</h1>
      {error && <div className="error" role="alert">{error}</div>}
      <label className="field" style={{ maxWidth: 420 }}>Артикул
        <select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
          <option value="">Все артикулы</option>{articles.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </label>

      {article && canEdit && <ReceiveRollForm article={article} onDone={refresh} />}

      {article && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Рулоны и обрезки</h2>
          <div className="table-scroll"><table className="data"><thead><tr><th>Что</th><th>Размер, см</th><th>Шт.</th><th>Площадь</th><th /></tr></thead><tbody>
            {materials.map((m) => (
              <tr key={m.id}><td>{m.kind === 'ROLL' ? 'Рулон' : 'Обрезок'}</td><td className="num">{m.widthCm} × {m.lengthCm}</td><td className="num">{m.qty}</td><td className="num">{formatM2(m.areaM2)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" type="button" onClick={() => void showHistory(m.id)}>История</button>
                  {canEdit && <button className="btn ghost" type="button" onClick={() => setAdjust({ type: 'MATERIAL', id: m.id })}>Корректировка</button>}</td></tr>
            ))}
            {materials.length === 0 && <tr><td colSpan={5} className="muted">Остатков нет. Примите рулон.</td></tr>}
          </tbody></table></div>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Готовые ковры</h2>
        <label className="field" style={{ maxWidth: 320, marginBottom: 12 }}>Поиск ковров<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Артикул, название или штрихкод" /></label>
        <div className="table-scroll"><table className="data"><thead><tr><th>Артикул</th><th>Размер, см</th><th>Штрихкод</th><th>Шт.</th><th /></tr></thead><tbody>
          {carpets.map((c) => (
            <tr key={c.skuId}><td className="num">{c.articleCode}</td><td className="num">{c.widthCm} × {c.lengthCm}</td><td className="num">{c.ean13 ?? '—'}</td><td className="num">{c.qty}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" type="button" onClick={() => void showHistory(c.skuId)}>История</button>
                {canEdit && <button className="btn ghost" type="button" onClick={() => setAdjust({ type: 'CARPET', id: c.skuId })}>Корректировка</button>}</td></tr>
          ))}
          {carpets.length === 0 && <tr><td colSpan={5} className="muted">Готовых ковров пока нет. Они появятся после раскроя.</td></tr>}
        </tbody></table></div>
      </div>

      {adjust && <AdjustForm itemType={adjust.type} id={adjust.id} onDone={refresh} />}

      {history && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>История операций</h2>
          <div className="table-scroll"><table className="data"><thead><tr><th>Когда</th><th>Операция</th><th>Шт.</th><th>Причина</th><th>Кто</th></tr></thead><tbody>
            {history.map((m) => <tr key={m.id}><td className="num">{new Date(m.createdAt).toLocaleString('ru-RU')}</td><td>{KIND[m.kind] ?? m.kind}</td><td className="num">{m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}</td><td>{m.reason ?? ''}</td><td>{m.userEmail ?? ''}</td></tr>)}
          </tbody></table></div>
          <button className="btn ghost" type="button" onClick={() => setHistory(null)}>Закрыть</button>
        </div>
      )}
    </div>
  );
}
