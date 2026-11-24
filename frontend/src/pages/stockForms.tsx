import { FormEvent, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { formatM2 } from '../format';

const toInt = (v: string): number => (v.trim() === '' ? NaN : Number(v));

export function ReceiveRollForm({ article, onDone }: { article: { id: string; rollWidthCm: number }; onDone: () => void }) {
  const [width, setWidth] = useState(String(article.rollWidthCm)); const [length, setLength] = useState(''); const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const w = toInt(width); const l = toInt(length); const c = toInt(count);
  const area = w > 0 && l > 0 ? (w * l) / 10_000 : null;

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (![w, l, c].every((n) => Number.isInteger(n) && n > 0)) { setError('Ширина, длина и количество — целые числа больше 0'); return; }
    setError(null); setBusy(true);
    try { await apiFetch('/api/stock/rolls', { method: 'POST', body: { articleId: article.id, widthCm: w, lengthCm: l, count: c } }); setLength(''); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось принять рулон'); }
    finally { setBusy(false); }
  }

  return (
    <form className="stack panel" onSubmit={submit} noValidate aria-label="Приход рулона">
      <h3 style={{ margin: 0 }}>Принять рулон</h3>
      <label className="field">Ширина, см<input type="number" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} /></label>
      <label className="field">Длина, см<input type="number" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} /></label>
      <label className="field">Количество рулонов<input type="number" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></label>
      {area !== null && <div className="num">Площадь рулона: {formatM2(area)}</div>}
      {area !== null && c > 1 && <div className="num muted">Всего: {formatM2(area * c)}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>Принять</button>
    </form>
  );
}

export function AdjustForm({ itemType, id, onDone }: { itemType: 'MATERIAL' | 'CARPET'; id: string; onDone: () => void }) {
  const [qty, setQty] = useState('-1'); const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const n = toInt(qty);
    if (!reason.trim()) { setError('Укажите причину'); return; }
    if (!Number.isInteger(n) || n === 0) { setError('Изменение — целое число, не равное 0'); return; }
    setError(null); setBusy(true);
    try { await apiFetch('/api/stock/adjust', { method: 'POST', body: { itemType, id, qtyDelta: n, reason: reason.trim() } }); setReason(''); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось провести корректировку'); }
    finally { setBusy(false); }
  }

  return (
    <form className="stack panel" onSubmit={submit} noValidate aria-label="Корректировка остатка">
      <h3 style={{ margin: 0 }}>Списание и оприходование</h3>
      <label className="field">Изменение, шт.<input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <label className="field">Причина<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: брак ткани, инвентаризация" /></label>
      <span className="muted">Минус списывает, плюс приходует.</span>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>Провести</button>
    </form>
  );
}
