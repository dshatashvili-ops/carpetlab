import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { formatRub } from '../format';

interface OrgRow { id: string; name: string; owners: string[]; articlesCount: number; membersCount: number; subscription: { plan: number; status: string; expiresAt: string } | null }
interface InvoiceRow { id: string; orgName: string | null; plan: number; months: number; amountKopecks: number; status: string; createdAt: string }
interface Price { plan: number; months: number; priceKopecks: number }
const MONTHS = [1, 3, 6, 12];

export function Admin() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]); const [invoices, setInvoices] = useState<InvoiceRow[]>([]); const [grid, setGrid] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const fail = (e: unknown, f: string): void => setError(e instanceof ApiError ? e.message : f);
  const load = useCallback(async () => {
    try {
      setOrgs(await apiFetch<OrgRow[]>('/api/admin/orgs')); setInvoices(await apiFetch<InvoiceRow[]>('/api/admin/invoices'));
      const prices = await apiFetch<Price[]>('/api/billing/prices');
      setGrid(Object.fromEntries(prices.map((p) => [`${p.plan}-${p.months}`, String(p.priceKopecks / 100)])));
    } catch (e) { fail(e, 'Не удалось загрузить данные'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markPaid(id: string): Promise<void> { setError(null); try { await apiFetch(`/api/admin/invoices/${id}/mark-paid`, { method: 'POST' }); await load(); } catch (e) { fail(e, 'Не удалось подтвердить оплату'); } }
  async function savePrices(): Promise<void> {
    setError(null); setSaved(false);
    const prices = Object.entries(grid).filter(([, v]) => v.trim() !== '').map(([k, v]) => { const [plan, months] = k.split('-').map(Number); return { plan, months, priceKopecks: Math.round(Number(v) * 100) }; });
    try { await apiFetch('/api/admin/tariff-prices', { method: 'PUT', body: { prices } }); setSaved(true); await load(); } catch (e) { fail(e, 'Не удалось сохранить цены'); }
  }

  return (
    <div className="section" style={{ display: 'grid', gap: 20 }}>
      <h1 style={{ marginBottom: 0 }}>Администратор сервиса</h1>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="panel"><h2 style={{ marginTop: 0 }}>Организации</h2>
        <div className="table-scroll"><table className="data"><thead><tr><th>Организация</th><th>Владельцы</th><th>Артикулы</th><th>Сотрудники</th><th>Подписка</th></tr></thead><tbody>
          {orgs.map((o) => <tr key={o.id}><td>{o.name}</td><td>{o.owners.map((e) => <div key={e}>{e}</div>)}</td><td className="num">{o.articlesCount}</td><td className="num">{o.membersCount}</td>
            <td>{o.subscription ? `тариф ${o.subscription.plan}, ${o.subscription.status}, до ${new Date(o.subscription.expiresAt).toLocaleDateString('ru-RU')}` : '—'}</td></tr>)}
        </tbody></table></div></div>

      <div className="panel"><h2 style={{ marginTop: 0 }}>Счета по реквизитам</h2>
        <div className="table-scroll"><table className="data"><thead><tr><th>Организация</th><th>Тариф</th><th>Срок</th><th>Сумма</th><th>Статус</th><th /></tr></thead><tbody>
          {invoices.map((i) => <tr key={i.id}><td>{i.orgName}</td><td className="num">{i.plan}</td><td className="num">{i.months} мес.</td><td className="num">{formatRub(i.amountKopecks)}</td><td>{i.status === 'PENDING' ? 'ждет оплаты' : 'оплачен'}</td>
            <td>{i.status === 'PENDING' && <button className="btn ghost" type="button" onClick={() => void markPaid(i.id)}>Подтвердить оплату</button>}</td></tr>)}
          {invoices.length === 0 && <tr><td colSpan={6} className="muted">Счетов нет.</td></tr>}
        </tbody></table></div></div>

      <div className="panel"><h2 style={{ marginTop: 0 }}>Цены тарифов, ₽</h2>
        <div className="table-scroll"><table className="data"><thead><tr><th>Тариф</th>{MONTHS.map((m) => <th key={m}>{m} мес.</th>)}</tr></thead><tbody>
          {[1, 2, 3].map((plan) => <tr key={plan}><td>Тариф {plan}</td>{MONTHS.map((m) => (
            <td key={m}><input className="num" style={{ width: 110 }} inputMode="decimal" aria-label={`Тариф ${plan}, ${m} мес., ₽`} value={grid[`${plan}-${m}`] ?? ''} onChange={(e) => setGrid((g) => ({ ...g, [`${plan}-${m}`]: e.target.value }))} /></td>))}</tr>)}
        </tbody></table></div>
        <div className="cta" style={{ marginTop: 12 }}><button className="btn" type="button" onClick={() => void savePrices()}>Сохранить цены</button>{saved && <span role="status" style={{ color: 'var(--ok)' }}>Цены сохранены</span>}</div></div>
    </div>
  );
}
