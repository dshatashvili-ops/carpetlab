import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';

interface Problem { itemType: 'MATERIAL' | 'CARPET'; materialId?: string; skuId?: string; kind?: string; widthCm: number; lengthCm: number; balance: number; documentIds: string[] }

export function Problems() {
  const [rows, setRows] = useState<Problem[] | null>(null); const [docs, setDocs] = useState<{ id: string; number: number }[]>([]); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([apiFetch<Problem[]>('/api/stock/problems'), apiFetch<{ id: string; number: number }[]>('/api/cuts')])
      .then(([p, d]) => { setRows(p); setDocs(d); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить данные'));
  }, []);
  return (
    <div className="section">
      <h1>Проблемные остатки</h1>
      <p className="muted">Позиции, у которых остаток ушел в минус, например после правки документа, на который уже опирались другие раскрои.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {rows && rows.length === 0 && <p>Проблемных остатков нет.</p>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data"><thead><tr><th>Что</th><th>Размер, см</th><th>Остаток</th><th>Документы</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.materialId ?? r.skuId}><td>{r.itemType === 'CARPET' ? 'Готовый ковер' : r.kind === 'ROLL' ? 'Рулон' : 'Обрезок'}</td>
              <td className="num">{r.widthCm} × {r.lengthCm}</td><td className="num">{`−${Math.abs(r.balance)}`}</td>
              <td>{r.documentIds.map((id) => { const d = docs.find((x) => x.id === id); return <Link key={id} to={`/app/documents/${id}`} style={{ marginRight: 8 }}>{d ? `№ ${d.number}` : 'Документ'}</Link>; })}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}
