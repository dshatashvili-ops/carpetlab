import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { CutPlanData, CutPlanSvg } from '../components/CutPlanSvg';
import { formatM2 } from '../format';
import { useCanEdit } from '../session/SessionProvider';
import type { Article } from './Articles';

interface Size { id: string; widthCm: number; lengthCm: number }
interface Material { id: string; kind: 'ROLL' | 'REMNANT'; widthCm: number; lengthCm: number; qty: number; areaM2: number }
interface Calc {
  stock: { materials: Material[] }; requests: { sizeId: string; widthCm: number; lengthCm: number; qty: number }[]; plan: CutPlanData;
  sourceAreaM2: number; usedAreaM2: number; remnantAreaM2: number; wasteAreaM2: number;
}
const DEBOUNCE_MS = 300;
const label = (s: { widthCm: number; lengthCm: number }): string => `${s.widthCm} × ${s.lengthCm}`;
const isQty = (v: string): boolean => /^\d+$/.test(v.trim());

export function Cutting() {
  const canEdit = useCanEdit(); const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]); const [sizes, setSizes] = useState<Size[]>([]);
  const [articleId, setArticleId] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({}); const [manual, setManual] = useState(false);
  const [calc, setCalc] = useState<Calc | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [hint, setHint] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    apiFetch<Article[]>('/api/articles').then(setArticles).catch(() => setError('Не удалось загрузить артикулы'));
    apiFetch<Size[]>('/api/sizes').then(setSizes).catch(() => setError('Не удалось загрузить размеры'));
  }, []);

  const quantities = useMemo(
    () => selected.map((sizeId) => ({ sizeId, qty: Number(qty[sizeId] ?? '0') })),
    [selected, qty],
  );
  const invalid = manual && selected.some((id) => !isQty(qty[id] ?? ''));
  // Only hand-edited quantities may retrigger a calculation; quantities filled in from a suggestion must not.
  const manualKey = manual ? JSON.stringify(quantities) : '';

  useEffect(() => {
    if (!articleId || selected.length === 0) { setCalc(null); return; }
    if (invalid) { setHint('Количество — целое число не меньше 0'); return; }
    setHint(null);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const body = manual ? { articleId, sizeIds: selected, quantities } : { articleId, sizeIds: selected };
        const res = await apiFetch<Calc>('/api/cuts/calculate', { method: 'POST', body });
        if (mine !== seq.current) return;
        setCalc(res); setError(null);
        if (!manual) setQty(Object.fromEntries(res.requests.map((r) => [r.sizeId, String(r.qty)])));
      } catch (e) { if (mine === seq.current) setError(e instanceof ApiError ? e.message : 'Не удалось рассчитать раскрой'); }
    }, manual ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
    // `quantities` is read through manualKey so that suggested values do not trigger a second request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, selected, manual, manualKey, invalid]);

  const toggle = (id: string): void => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); setManual(false); };
  const sizeById = useMemo(() => new Map(sizes.map((s) => [s.id, s])), [sizes]);
  const article = articles.find((a) => a.id === articleId);

  const sources = useMemo(() => {
    const map: Record<string, { widthCm: number; lengthCm: number }> = {};
    if (!calc) return map;
    const mats = new Map(calc.stock.materials.map((m) => [m.id, m]));
    for (const id of [...calc.plan.placements.map((p) => p.sourceId), ...calc.plan.remnants.map((r) => r.sourceId)]) {
      const m = mats.get(id.split('#')[0]); if (m) map[id] = { widthCm: m.widthCm, lengthCm: m.lengthCm };
    }
    return map;
  }, [calc]);

  const total = quantities.reduce((a, q) => a + (Number.isInteger(q.qty) ? q.qty : 0), 0);
  const canRun = canEdit && !!calc?.plan.feasible && total > 0 && !invalid && !busy;
  const sizeLabels = Object.fromEntries(sizes.map((s) => [s.id, label(s).replace(' × ', '×')]));

  const run = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const doc = await apiFetch<{ id: string }>('/api/cuts', { method: 'POST', body: { articleId, sizeIds: selected, quantities } });
      navigate(`/app/documents/${doc.id}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось выполнить раскрой'); setBusy(false); }
  }, [articleId, selected, quantities, navigate]);

  return (
    <div className="section" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ marginBottom: 0 }}>Раскрой</h1>
      <label className="field" style={{ maxWidth: 420 }}>Артикул
        <select value={articleId} onChange={(e) => { setArticleId(e.target.value); setSelected([]); setQty({}); setManual(false); setCalc(null); }}>
          <option value="">Выберите артикул</option>{articles.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </label>

      {article && (
        <fieldset className="panel" style={{ margin: 0 }}>
          <legend>Размеры ковров ({article.cutMode === 'LINEAR' ? 'резка только поперек' : 'можно резать и вдоль'})</legend>
          {sizes.length === 0 && <p className="muted">Сначала добавьте шаблонные размеры в разделе «Размеры».</p>}
          <div className="cta">
            {sizes.map((s) => (
              <label key={s.id} className="chip"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} aria-label={label(s)} /> <span className="num">{label(s)}</span></label>
            ))}
          </div>
        </fieldset>
      )}

      {selected.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <div className="cta">
            {selected.map((id) => (
              <label key={id} className="field num" style={{ maxWidth: 160 }}>
                {label(sizeById.get(id)!)}
                <input type="number" min={0} inputMode="numeric" aria-label={`Количество ${label(sizeById.get(id)!)}`} value={qty[id] ?? ''}
                  onChange={(e) => { setManual(true); setQty((q) => ({ ...q, [id]: e.target.value })); }} />
              </label>
            ))}
          </div>
          {hint && <div className="error" role="alert">{hint}</div>}
          {error && <div className="error" role="alert">{error}</div>}

          {calc && article && (
            <>
              <CutPlanSvg plan={calc.plan} rollWidthCm={article.rollWidthCm} rollLengthCm={2500} sources={sources} sizeLabels={sizeLabels} />
              <div className="summary" style={{ display: 'flex', gap: '12px 28px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="cta">
                  <div><strong className="num">{formatM2(calc.usedAreaM2)}</strong><div className="muted">в ковры из {formatM2(calc.sourceAreaM2)}</div></div>
                  <div><strong className="num">{formatM2(calc.remnantAreaM2)}</strong><div className="muted">останется в обрезках</div></div>
                  <div>
                    {calc.plan.feasible
                      ? <strong style={{ color: 'var(--ok)' }}>Можно выполнить</strong>
                      : <strong style={{ color: 'var(--accent)' }}>Не хватает материала</strong>}
                    {!calc.plan.feasible && calc.plan.shortfall.map((s) => {
                      const size = sizeById.get(s.sizeId); return <div key={s.sizeId} className="muted num">{size ? label(size) : s.sizeId}: не хватает {s.missing} шт.</div>;
                    })}
                  </div>
                </div>
                {canEdit && <button className="btn" type="button" disabled={!canRun} onClick={() => void run()}>Выполнить раскрой</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
