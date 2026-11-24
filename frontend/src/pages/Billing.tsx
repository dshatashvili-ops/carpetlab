import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { formatRub } from '../format';
import { redirect } from '../navigation';
import { useSession } from '../session/SessionProvider';

interface Price { plan: number; months: number; priceKopecks: number }
interface Invoice { amountKopecks: number; description: string; payer: string }

export function Billing() {
  const { subscription, user } = useSession();
  const [prices, setPrices] = useState<Price[]>([]); const [plan, setPlan] = useState(subscription?.plan ?? 1); const [months, setMonths] = useState(1);
  const [invoice, setInvoice] = useState<Invoice | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { apiFetch<Price[]>('/api/billing/prices').then(setPrices).catch(() => setError('Не удалось загрузить цены')); }, []);
  useEffect(() => { if (subscription) setPlan(subscription.plan); }, [subscription]);

  const price = prices.find((p) => p.plan === plan && p.months === months);
  const date = subscription ? new Date(subscription.expiresAt).toLocaleDateString('ru-RU') : '';

  async function pay(method: 'YOOKASSA' | 'INVOICE'): Promise<void> {
    setBusy(true); setError(null); setInvoice(null);
    try {
      const res = await apiFetch<{ confirmationUrl?: string; invoice?: Invoice }>('/api/billing/checkout', { method: 'POST', body: { plan, months, method } });
      if (res.confirmationUrl) redirect(res.confirmationUrl); else if (res.invoice) setInvoice(res.invoice);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось оформить оплату'); }
    finally { setBusy(false); }
  }

  if (user && user.role !== 'OWNER') return <div className="section"><p>Подпиской управляет владелец организации.</p></div>;
  return (
    <div className="section" style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>Подписка</h1>
      {subscription && (
        <p style={{ margin: 0 }}>
          {subscription.status === 'TRIAL' && `Пробный период, осталось ${subscription.daysLeft} дн. (до ${date}).`}
          {subscription.status === 'ACTIVE' && `Тариф ${subscription.plan}, действует до ${date} (осталось ${subscription.daysLeft} дн.).`}
          {subscription.status === 'EXPIRED' && `Подписка закончилась ${date}. Данные доступны только для просмотра.`}
        </p>
      )}
      <div className="panel stack">
        <label className="field">Тариф<select value={plan} onChange={(e) => setPlan(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>Тариф {n}</option>)}</select></label>
        <label className="field">Срок<select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} мес.</option>)}</select></label>
        <div className="num">{price ? <>Цена: {formatRub(price.priceKopecks)}</> : <span className="muted">Цена для этого срока пока не задана</span>}</div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="cta">
          <button className="btn" type="button" disabled={!price || busy} onClick={() => void pay('YOOKASSA')}>Оплатить картой или через СБП</button>
          <button className="btn ghost" type="button" disabled={!price || busy} onClick={() => void pay('INVOICE')}>Получить счет по реквизитам</button>
        </div>
        <span className="muted">Подписка не продлевается автоматически: за месяц, за 15 дней и в последние 7 дней мы напомним по почте.</span>
      </div>
      {invoice && (
        <section className="panel" role="region" aria-label="Счет">
          <h2 style={{ marginTop: 0 }}>Счет создан</h2>
          <p className="num">{invoice.description}<br />Плательщик: {invoice.payer}<br />К оплате: {formatRub(invoice.amountKopecks)}</p>
          <p className="muted" style={{ marginBottom: 0 }}>После поступления оплаты администратор подтвердит счет, и подписка продлится.</p>
        </section>
      )}
    </div>
  );
}
