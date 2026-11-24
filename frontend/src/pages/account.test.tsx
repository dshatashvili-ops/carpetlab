import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { redirect } from '../navigation';
import { mockApi, renderWithSession, SUB, sessionHandlers } from '../testUtils';
import { AcceptInvite } from './AcceptInvite';
import { Admin } from './Admin';
import { Articles } from './Articles';
import { Billing } from './Billing';
import { Employees } from './Employees';
import { OrgSettings } from './OrgSettings';

vi.mock('../navigation', () => ({ redirect: vi.fn() }));

const EXPIRED = { ...SUB, status: 'EXPIRED', daysLeft: 0, noticeBanner: { level: 'expired', daysLeft: 0 } };
const PRICES = [{ plan: 2, months: 3, priceKopecks: 450_000 }, { plan: 1, months: 1, priceKopecks: 150_000 }];

describe('expired subscription', () => {
  it('hides write buttons and shows a pay banner for the owner', async () => {
    mockApi({ ...sessionHandlers('OWNER', EXPIRED), 'GET /api/articles': [] });
    renderWithSession(<Routes><Route path="/app" element={<AppLayout />}><Route path="articles" element={<Articles />} /></Route></Routes>, '/app/articles');
    expect(await screen.findByText(/Подписка закончилась/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Продлить' })).toHaveAttribute('href', '/app/billing');
    expect(screen.queryByRole('button', { name: 'Новый артикул' })).not.toBeInTheDocument();
  });
});

describe('Billing', () => {
  it('shows the current subscription and the price of the chosen tariff and term', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/billing/prices': PRICES });
    renderWithSession(<Billing />);
    expect(await screen.findByText(/Пробный период/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Тариф'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Срок'), '3');
    expect(await screen.findByText(/4\s?500\s?₽/)).toBeInTheDocument();
  });

  it('pays by card: posts the checkout and redirects to the confirmation url', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/billing/prices': PRICES, 'POST /api/billing/checkout': { paymentId: 'p1', confirmationUrl: 'https://pay.example/c/1' } });
    renderWithSession(<Billing />);
    await screen.findByText(/Пробный период/);
    await userEvent.selectOptions(screen.getByLabelText('Тариф'), '2'); await userEvent.selectOptions(screen.getByLabelText('Срок'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Оплатить картой или через СБП' }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('https://pay.example/c/1'));
    expect(calls.find((c) => c.url === '/api/billing/checkout')?.body).toEqual({ plan: 2, months: 3, method: 'YOOKASSA' });
  });

  it('requests an invoice and shows its amount', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/billing/prices': PRICES, 'POST /api/billing/checkout': { paymentId: 'p2', invoice: { amountKopecks: 150_000, description: 'CarpetLAB, тариф 1, 1 мес.', payer: 'Ковры+' } } });
    renderWithSession(<Billing />);
    await screen.findByText(/Пробный период/);
    await userEvent.click(screen.getByRole('button', { name: 'Получить счет по реквизитам' }));
    const invoice = await screen.findByRole('region', { name: 'Счет' });
    expect(within(invoice).getByText(/1\s?500\s?₽/)).toBeInTheDocument();
    expect(within(invoice).getByText(/Ковры\+/)).toBeInTheDocument();
  });

  it('a tariff without a price cannot be bought', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/billing/prices': PRICES });
    renderWithSession(<Billing />);
    await screen.findByText(/Пробный период/);
    await userEvent.selectOptions(screen.getByLabelText('Тариф'), '3');
    expect(await screen.findByText('Цена для этого срока пока не задана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оплатить картой или через СБП' })).toBeDisabled();
  });
});

describe('Employees', () => {
  const list = { members: [{ id: 'm1', userId: 'u1', email: 'owner@example.com', role: 'OWNER' }, { id: 'm2', userId: 'u2', email: 'op@example.com', role: 'OPERATOR' }], pendingInvites: [{ email: 'new@example.com', role: 'CUTTER' }] };

  it('lists members and pending invitations, and invites a new employee with a role', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/employees': list, 'POST /api/employees': { ok: true } });
    renderWithSession(<Employees />);
    expect(await screen.findByText('op@example.com')).toBeInTheDocument();
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('E-mail сотрудника'), 'cut@example.com');
    await userEvent.selectOptions(screen.getByLabelText('Роль'), 'CUTTER');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/employees')?.body).toEqual({ email: 'cut@example.com', role: 'CUTTER' }));
  });

  it('shows the plan limit message when the API refuses the invitation', async () => {
    globalThis.fetch = vi.fn(async (url: string, init: { method?: string } = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`;
      const answer = (ok: boolean, status: number, body: unknown) => ({ ok, status, json: async () => body, text: async () => '' });
      if (key === 'GET /api/auth/me') return answer(true, 200, { userId: 'u1', orgId: 'o1', role: 'OWNER', emailVerified: true });
      if (key === 'GET /api/subscription') return answer(true, 200, SUB);
      if (key === 'GET /api/employees') return answer(true, 200, list);
      return answer(false, 409, { code: 'LIMIT_REACHED', message: 'Лимит сотрудников тарифа: 3' });
    }) as unknown as typeof fetch;
    renderWithSession(<Employees />);
    await screen.findByText('op@example.com');
    await userEvent.type(screen.getByLabelText('E-mail сотрудника'), 'x@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Лимит сотрудников тарифа: 3');
  });
});

describe('OrgSettings', () => {
  const settings = { name: 'Ковры+', gsPrefix: null, minRemnantSideCm: 30, labelWidthMm: 58, labelHeightMm: 40 };

  it('saves the GS1 prefix and shows a hint that registration is on the user side', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/org/settings': settings, 'PUT /api/org/gs-prefix': { gsPrefix: '4600123' } });
    renderWithSession(<OrgSettings />);
    expect(await screen.findByText(/регистрация в GS1/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Префикс GS1'), '4600123');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить префикс' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/org/gs-prefix')?.body).toEqual({ prefix: '4600123' }));
  });

  it('shows the 409 message when the prefix cannot be changed after barcodes were issued', async () => {
    globalThis.fetch = vi.fn(async (url: string, init: { method?: string } = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`;
      const answer = (ok: boolean, status: number, body: unknown) => ({ ok, status, json: async () => body, text: async () => '' });
      if (key === 'GET /api/auth/me') return answer(true, 200, { userId: 'u1', orgId: 'o1', role: 'OWNER', emailVerified: true });
      if (key === 'GET /api/subscription') return answer(true, 200, SUB);
      if (key === 'GET /api/org/settings') return answer(true, 200, { ...settings, gsPrefix: '4600123' });
      return answer(false, 409, { message: 'Префикс нельзя менять после присвоения штрихкодов' });
    }) as unknown as typeof fetch;
    renderWithSession(<OrgSettings />);
    const input = await screen.findByLabelText('Префикс GS1');
    await userEvent.clear(input); await userEvent.type(input, '4600999');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить префикс' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Префикс нельзя менять после присвоения штрихкодов');
  });

  it('saves the remnant threshold and the label size', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/org/settings': settings, 'PATCH /api/org/settings': { ...settings, minRemnantSideCm: 20 } });
    renderWithSession(<OrgSettings />);
    const min = await screen.findByLabelText('Минимальная сторона обрезка, см');
    await userEvent.clear(min); await userEvent.type(min, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ minRemnantSideCm: 20, labelWidthMm: 58, labelHeightMm: 40 }));
  });
});

describe('AcceptInvite', () => {
  it('sets the password with the token from the link and signs in', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'POST /api/auth/accept-invite': { ok: true } });
    renderWithSession(<Routes><Route path="/accept-invite" element={<AcceptInvite />} /><Route path="/app" element={<div>Кабинет открыт</div>} /></Routes>, '/accept-invite?token=abc123');
    await userEvent.type(screen.getByLabelText('Пароль'), 'correct-horse-1');
    await userEvent.click(screen.getByRole('button', { name: 'Принять приглашение' }));
    expect(await screen.findByText('Кабинет открыт')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/auth/accept-invite')?.body).toEqual({ token: 'abc123', password: 'correct-horse-1' });
  });

  it('rejects a short password locally', async () => {
    const calls = mockApi(sessionHandlers());
    renderWithSession(<Routes><Route path="/accept-invite" element={<AcceptInvite />} /></Routes>, '/accept-invite?token=abc');
    await userEvent.type(screen.getByLabelText('Пароль'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Принять приглашение' }));
    expect(screen.getByRole('alert')).toHaveTextContent('не короче 10 символов');
    expect(calls.some((c) => c.url === '/api/auth/accept-invite')).toBe(false);
  });
});

describe('Admin', () => {
  it('lists organizations and invoices and confirms an invoice payment', async () => {
    const calls = mockApi({
      ...sessionHandlers(),
      'GET /api/admin/orgs': [{ id: 'o1', name: 'Ковры+', owners: ['owner@example.com'], articlesCount: 3, membersCount: 2, subscription: { plan: 1, status: 'TRIAL', expiresAt: '2030-01-01T00:00:00Z' } }],
      'GET /api/admin/invoices': [{ id: 'i1', orgName: 'Ковры+', plan: 2, months: 3, amountKopecks: 450_000, status: 'PENDING', createdAt: '2027-01-01T00:00:00Z' }],
      'GET /api/billing/prices': PRICES, 'POST /api/admin/invoices/i1/mark-paid': { alreadyApplied: false },
    });
    renderWithSession(<Admin />);
    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить оплату' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/admin/invoices/i1/mark-paid')).toBe(true));
  });

  it('saves prices entered in rubles as kopecks', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/admin/orgs': [], 'GET /api/admin/invoices': [], 'GET /api/billing/prices': [], 'PUT /api/admin/tariff-prices': [] });
    renderWithSession(<Admin />);
    const cell = await screen.findByLabelText('Тариф 1, 1 мес., ₽');
    await userEvent.type(cell, '1500');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить цены' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ prices: [{ plan: 1, months: 1, priceKopecks: 150_000 }] }));
  });
});
