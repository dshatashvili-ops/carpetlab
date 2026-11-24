import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { useCanEdit } from '../session/SessionProvider';

export interface DocLine { sourceMaterialId: string; sourceKind: 'ROLL' | 'REMNANT'; sourceWidthCm: number; sourceLengthCm: number; sizeId: string; sizeWidthCm: number; sizeLengthCm: number; qty: number }
export interface DocDetail {
  id: string; number: number; status: string; version: number; articleId: string; articleCode: string; articleName: string; createdAt: string;
  lines: DocLine[]; outputs: { skuId: string; ean13: string | null; widthCm: number; lengthCm: number; qty: number }[];
  remnants: { materialId: string; widthCm: number; lengthCm: number; qty: number }[];
}
export interface Warning { itemType: 'MATERIAL' | 'CARPET'; materialId?: string; skuId?: string; balance: number; laterDocumentIds: string[] }
interface HistoryRow { version: number; reason: string; createdAt: string; editedByEmail: string | null; snapshot: { before: { outputs: { qty: number }[] }; after: { outputs: { qty: number }[] } } }
type DocRef = { id: string; number: number };

const src = (l: DocLine): string => `${l.sourceKind === 'ROLL' ? 'Рулон' : 'Обрезок'} ${l.sourceWidthCm} × ${l.sourceLengthCm}`;
const sum = (xs: { qty: number }[]): number => xs.reduce((a, x) => a + x.qty, 0);
const isQty = (v: string): boolean => /^\d+$/.test(v.trim());

export function DocumentEditForm({ doc, docs, onSaved, onCancel }: { doc: DocDetail; docs: DocRef[]; onSaved: () => void; onCancel: () => void }) {
  const [qty, setQty] = useState(doc.lines.map((l) => String(l.qty)));
  const [rem, setRem] = useState(doc.remnants.map((r) => ({ widthCm: String(r.widthCm), lengthCm: String(r.lengthCm), qty: String(r.qty) })));
  const [remDirty, setRemDirty] = useState(false); const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [warnings, setWarnings] = useState<Warning[] | null>(null);

  const editRem = (i: number, key: 'widthCm' | 'lengthCm' | 'qty', value: string): void => { setRemDirty(true); setRem((r) => r.map((x, n) => (n === i ? { ...x, [key]: value } : x))); };

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!reason.trim()) { setError('Укажите причину правки'); return; }
    if (!qty.every(isQty) || (remDirty && !rem.every((r) => isQty(r.widthCm) && isQty(r.lengthCm) && isQty(r.qty)))) { setError('Количества и размеры — целые числа не меньше 0'); return; }
    setError(null); setBusy(true);
    const body: Record<string, unknown> = { reason: reason.trim(), lines: doc.lines.map((l, i) => ({ sourceMaterialId: l.sourceMaterialId, sizeId: l.sizeId, qty: Number(qty[i]) })) };
    if (remDirty) body.remnants = rem.map((r) => ({ widthCm: Number(r.widthCm), lengthCm: Number(r.lengthCm), qty: Number(r.qty) }));
    try {
      const res = await apiFetch<{ warnings: Warning[] }>(`/api/cuts/${doc.id}`, { method: 'PATCH', body });
      if (res.warnings.length > 0) setWarnings(res.warnings); else onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось сохранить правку'); }
    finally { setBusy(false); }
  }

  if (warnings) {
    const later = [...new Set(warnings.flatMap((w) => w.laterDocumentIds))];
    return (
      <div className="panel" role="status">
        <p><strong>Изменение сохранено</strong>, но остатки теперь расходятся с более поздними документами.</p>
        {later.length > 0 && <p>Затронуты: {later.map((id) => { const d = docs.find((x) => x.id === id); return <Link key={id} to={`/app/documents/${id}`} style={{ marginRight: 8 }}>{d ? `Документ № ${d.number}` : 'Документ'}</Link>; })}</p>}
        <p className="muted">Позиции с отрицательным остатком собраны в разделе <Link to="/app/problems">«Проблемные остатки»</Link>. Исправьте их правкой документов или ручным списанием.</p>
        <button className="btn" type="button" onClick={onSaved}>Готово</button>
      </div>
    );
  }

  return (
    <form className="stack panel" style={{ maxWidth: 620 }} onSubmit={submit} noValidate aria-label="Правка документа">
      <h3 style={{ margin: 0 }}>Исправить документ</h3>
      {doc.lines.map((l, i) => (
        <label className="field" key={i}>{src(l)} → {l.sizeWidthCm} × {l.sizeLengthCm}, шт.
          <input type="number" min={0} inputMode="numeric" value={qty[i]} onChange={(e) => setQty((q) => q.map((v, n) => (n === i ? e.target.value : v)))} />
        </label>
      ))}
      <fieldset style={{ border: '1px solid var(--line)', padding: 12 }}>
        <legend>Остались обрезки</legend>
        {rem.map((r, i) => (
          <div className="cta" key={i} style={{ alignItems: 'end' }}>
            <label className="field">Ширина<input aria-label={`Ширина обрезка ${i + 1}, см`} type="number" value={r.widthCm} onChange={(e) => editRem(i, 'widthCm', e.target.value)} /></label>
            <label className="field">Длина<input aria-label={`Длина обрезка ${i + 1}, см`} type="number" value={r.lengthCm} onChange={(e) => editRem(i, 'lengthCm', e.target.value)} /></label>
            <label className="field">Шт.<input aria-label={`Количество обрезка ${i + 1}`} type="number" value={r.qty} onChange={(e) => editRem(i, 'qty', e.target.value)} /></label>
            <button className="btn ghost" type="button" onClick={() => { setRemDirty(true); setRem((x) => x.filter((_, n) => n !== i)); }}>Убрать</button>
          </div>
        ))}
        <button className="btn ghost" type="button" onClick={() => { setRemDirty(true); setRem((x) => [...x, { widthCm: '', lengthCm: '', qty: '1' }]); }}>Добавить обрезок</button>
      </fieldset>
      <label className="field">Причина правки<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: один ковер ушел в брак" /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="cta"><button className="btn" type="submit" disabled={busy}>Сохранить правку</button><button className="btn ghost" type="button" onClick={onCancel}>Отмена</button></div>
    </form>
  );
}

export function DocumentView() {
  const { id } = useParams(); const canEdit = useCanEdit();
  const [doc, setDoc] = useState<DocDetail | null>(null); const [history, setHistory] = useState<HistoryRow[]>([]); const [docs, setDocs] = useState<DocRef[]>([]);
  const [editing, setEditing] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDoc(await apiFetch<DocDetail>(`/api/cuts/${id}`));
      setHistory(await apiFetch<HistoryRow[]>(`/api/cuts/${id}/history`));
      setDocs(await apiFetch<DocRef[]>('/api/cuts'));
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось загрузить документ'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="section"><div className="error" role="alert">{error}</div></div>;
  if (!doc) return <p className="muted">Загрузка…</p>;

  return (
    <div className="section" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Документ № {doc.number}</h1>
        <p className="muted" style={{ margin: 0 }}>Артикул <span className="num">{doc.articleCode}</span> · {doc.articleName} · {new Date(doc.createdAt).toLocaleString('ru-RU')} · версия {doc.version}</p>
      </div>
      <div className="cta">
        <a className="btn" href={`/api/cuts/${doc.id}/spec.pdf`} target="_blank" rel="noreferrer">Спецификация PDF</a>
        {canEdit && doc.status === 'DONE' && !editing && <button className="btn ghost" type="button" onClick={() => setEditing(true)}>Исправить</button>}
      </div>
      {editing && <DocumentEditForm doc={doc} docs={docs} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}

      <div className="panel"><h2 style={{ marginTop: 0 }}>Что резать</h2>
        <div className="table-scroll"><table className="data"><thead><tr><th>Из чего</th><th>Размер ковра, см</th><th>Шт.</th></tr></thead><tbody>
          {doc.lines.map((l, i) => <tr key={i}><td>{src(l)}</td><td className="num">{l.sizeWidthCm} × {l.sizeLengthCm}</td><td className="num">{l.qty}</td></tr>)}
        </tbody></table></div></div>

      <div className="panel"><h2 style={{ marginTop: 0 }}>Готовые ковры</h2>
        <div className="table-scroll"><table className="data"><thead><tr><th>Размер, см</th><th>Шт.</th><th>Штрихкод</th><th /></tr></thead><tbody>
          {doc.outputs.map((o) => (
            <tr key={o.skuId}><td className="num">{o.widthCm} × {o.lengthCm}</td><td className="num">{o.qty}</td><td className="num">{o.ean13 ?? '—'}</td>
              <td>{o.ean13 && <a href={`/api/skus/${o.skuId}/label.pdf?copies=${o.qty}`} target="_blank" rel="noreferrer">Этикетки</a>}</td></tr>
          ))}
        </tbody></table></div></div>

      <div className="panel"><h2 style={{ marginTop: 0 }}>Остались обрезки</h2>
        {doc.remnants.length === 0 ? <p className="muted" style={{ margin: 0 }}>Обрезков нет.</p> : <ul>{doc.remnants.map((r) => <li key={r.materialId} className="num">{r.widthCm} × {r.lengthCm} см — {r.qty} шт.</li>)}</ul>}</div>

      {history.length > 0 && (
        <div className="panel"><h2 style={{ marginTop: 0 }}>История правок</h2>
          <ul>{history.map((h) => (
            <li key={h.version}><span className="num">Версия {h.version}</span>, {new Date(h.createdAt).toLocaleString('ru-RU')}, {h.editedByEmail ?? '—'}: {h.reason}. Ковров было {sum(h.snapshot.before.outputs)}, стало {sum(h.snapshot.after.outputs)}.</li>
          ))}</ul></div>
      )}
    </div>
  );
}
