import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';

interface Row { id: string; number: number; articleCode: string; articleName: string; version: number; createdAt: string; createdByEmail: string | null }

export function Documents() {
  const [rows, setRows] = useState<Row[] | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiFetch<Row[]>('/api/cuts').then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить документы')); }, []);
  return (
    <div className="section">
      <h1>Документы раскроя</h1>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="table-scroll"><table className="data"><thead><tr><th>Документ</th><th>Дата</th><th>Артикул</th><th>Версия</th><th>Автор</th></tr></thead><tbody>
        {(rows ?? []).map((d) => (
          <tr key={d.id}><td><Link to={`/app/documents/${d.id}`}>№ {d.number}</Link></td><td className="num">{new Date(d.createdAt).toLocaleString('ru-RU')}</td>
            <td><span className="num">{d.articleCode}</span> · {d.articleName}</td><td className="num">{d.version}</td><td>{d.createdByEmail ?? ''}</td></tr>
        ))}
        {rows && rows.length === 0 && <tr><td colSpan={5} className="muted">Документов пока нет. Они появятся после первого раскроя.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
