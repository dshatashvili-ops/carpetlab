import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { formatMb, formatRub, monthsLabel } from '../format';

interface PlanInfo { plan: number; articles: number; employees: number; photoMb: number; prices: { months: number; priceKopecks: number }[] }

export function Pricing() {
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { apiFetch<{ plans: PlanInfo[] }>('/api/public/prices').then((r) => setPlans(r.plans)).catch(() => setFailed(true)); }, []);

  return (
    <div className="section">
      <h1>Тарифы</h1>
      <p className="muted">Подписка на 1, 3, 6 или 12 месяцев. Автопродления нет, за месяц и за 15 дней мы напомним по почте. Первые 7 дней бесплатно.</p>
      {failed && <p className="error" role="alert">Не удалось загрузить тарифы. Обновите страницу.</p>}
      <div className="grid-3">
        {(plans ?? []).map((p) => (
          <div className="panel" key={p.plan}>
            <h2 style={{ marginTop: 0 }}>Тариф {p.plan}</h2>
            <ul style={{ paddingLeft: 18 }}>
              <li>до {p.articles} артикулов</li>
              <li>до {p.employees} сотрудников</li>
              <li>фото: {formatMb(p.photoMb)}</li>
            </ul>
            {p.prices.length === 0 ? <p className="muted">Цена уточняется</p> : (
              <ul className="num" style={{ listStyle: 'none', padding: 0 }}>
                {p.prices.map((x) => <li key={x.months}>{monthsLabel(x.months)} — {formatRub(x.priceKopecks)}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="cta" style={{ marginTop: 20 }}><Link className="btn" to="/register">Попробовать 7 дней</Link></div>
    </div>
  );
}
