import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { mockApi, renderWithSession, sessionHandlers } from '../testUtils';
import { Cutting } from './Cutting';

const article = { id: 'a1', code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: false };
const sizes = [{ id: 's1', widthCm: 150, lengthCm: 200 }, { id: 's2', widthCm: 150, lengthCm: 300 }];
const materials = [{ id: 'm1', articleId: 'a1', kind: 'ROLL', widthCm: 150, lengthCm: 2500, qty: 1, areaM2: 37.5 }];
const calc = (qty: number, feasible = true, missing = 0) => ({
  cutMode: 'LINEAR', stock: { materials },
  requests: [{ sizeId: 's1', widthCm: 150, lengthCm: 200, qty }],
  plan: { feasible, shortfall: missing ? [{ sizeId: 's1', missing }] : [], remnants: [{ sourceId: 'm1#0', widthCm: 150, lengthCm: 2100, xCm: 0, yCm: 400 }],
    placements: Array.from({ length: qty }, (_, i) => ({ sourceId: 'm1#0', sizeId: 's1', xCm: 0, yCm: i * 200, widthCm: 150, lengthCm: 200 })) },
  sourceAreaM2: 37.5, usedAreaM2: qty * 3, remnantAreaM2: 31.5, wasteAreaM2: 0,
});

function setup(calculate: (i: { body: unknown }) => unknown, extra: Record<string, unknown> = {}) {
  const calls = mockApi({
    ...sessionHandlers(), 'GET /api/articles': [article], 'GET /api/sizes': sizes, 'GET /api/stock/materials': materials,
    'POST /api/cuts/calculate': calculate, ...extra,
  });
  renderWithSession(<Routes><Route path="/app/cutting" element={<Cutting />} /><Route path="/app/documents/:id" element={<div>Документ открыт</div>} /></Routes>, '/app/cutting');
  return calls;
}
const pick = async (): Promise<void> => {
  await userEvent.selectOptions(await screen.findByLabelText('Артикул'), 'a1');
  await userEvent.click(await screen.findByLabelText('150 × 200'));
};

describe('Cutting', () => {
  it('calculates suggested quantities, then recalculates once after the user edits a quantity', async () => {
    const calls = setup(({ body }) => calc((body as { quantities?: { qty: number }[] }).quantities?.[0].qty ?? 4));
    await pick();
    const input = await screen.findByLabelText('Количество 150 × 200');
    await waitFor(() => expect(input).toHaveValue(4));
    await userEvent.clear(input); await userEvent.type(input, '3');
    await new Promise((r) => setTimeout(r, 700));
    const posts = calls.filter((c) => c.url === '/api/cuts/calculate');
    expect(posts).toHaveLength(2);
    expect(posts[0].body).toEqual({ articleId: 'a1', sizeIds: ['s1'] });
    expect(posts[1].body).toEqual({ articleId: 'a1', sizeIds: ['s1'], quantities: [{ sizeId: 's1', qty: 3 }] });
    expect(await screen.findByText('Можно выполнить')).toBeInTheDocument();
  });

  it('when the stock is not enough, the button is disabled and the shortfall is shown', async () => {
    setup(() => calc(9, false, 1));
    await pick();
    expect(await screen.findByText(/не хватает 1 шт/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выполнить раскрой' })).toBeDisabled();
  });

  it('does not call the API for an invalid quantity and shows a hint', async () => {
    const calls = setup(() => calc(4));
    await pick();
    const input = await screen.findByLabelText('Количество 150 × 200');
    await waitFor(() => expect(input).toHaveValue(4));
    await userEvent.clear(input); await userEvent.type(input, '-2');
    await new Promise((r) => setTimeout(r, 600));
    expect(calls.filter((c) => c.url === '/api/cuts/calculate')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('целое число не меньше 0');
  });

  it('executing the cut posts the chosen quantities and opens the new document', async () => {
    const calls = setup(() => calc(4), { 'POST /api/cuts': { id: 'doc1', number: 1 } });
    await pick();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Выполнить раскрой' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Выполнить раскрой' }));
    expect(await screen.findByText('Документ открыт')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url === '/api/cuts')?.body).toEqual({ articleId: 'a1', sizeIds: ['s1'], quantities: [{ sizeId: 's1', qty: 4 }] });
  });

  it('a CUTTER can calculate but cannot execute', async () => {
    mockApi({ ...sessionHandlers('CUTTER'), 'GET /api/articles': [article], 'GET /api/sizes': sizes, 'GET /api/stock/materials': materials, 'POST /api/cuts/calculate': calc(4) });
    renderWithSession(<Cutting />);
    await pick();
    await screen.findByText('Можно выполнить');
    expect(screen.queryByRole('button', { name: 'Выполнить раскрой' })).not.toBeInTheDocument();
  });
});
