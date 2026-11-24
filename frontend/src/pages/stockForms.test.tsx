import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderWithSession, sessionHandlers } from '../testUtils';
import { AdjustForm, ReceiveRollForm } from './stockForms';

describe('ReceiveRollForm', () => {
  it('shows the area in m² while the user types 150 × 2500', async () => {
    mockApi(sessionHandlers());
    renderWithSession(<ReceiveRollForm article={{ id: 'a1', rollWidthCm: 150 }} onDone={() => undefined} />);
    expect(screen.getByLabelText('Ширина, см')).toHaveValue(150);
    await userEvent.type(screen.getByLabelText('Длина, см'), '2500');
    expect(screen.getByText(/37,5\s*м²/)).toBeInTheDocument();
  });

  it('posts the receipt and calls onDone', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'POST /api/stock/rolls': { materialId: 'm1' } });
    const done = vi.fn();
    renderWithSession(<ReceiveRollForm article={{ id: 'a1', rollWidthCm: 150 }} onDone={done} />);
    await userEvent.type(screen.getByLabelText('Длина, см'), '2500');
    await userEvent.clear(screen.getByLabelText('Количество рулонов')); await userEvent.type(screen.getByLabelText('Количество рулонов'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Принять' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(calls.find((c) => c.url === '/api/stock/rolls')?.body).toEqual({ articleId: 'a1', widthCm: 150, lengthCm: 2500, count: 2 });
  });
});

describe('AdjustForm', () => {
  it('blocks a write-off without a reason and sends nothing', async () => {
    const calls = mockApi(sessionHandlers());
    renderWithSession(<AdjustForm itemType="MATERIAL" id="m1" onDone={() => undefined} />);
    await userEvent.clear(screen.getByLabelText('Изменение, шт.')); await userEvent.type(screen.getByLabelText('Изменение, шт.'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите причину');
    expect(calls.some((c) => c.url === '/api/stock/adjust')).toBe(false);
  });

  it('posts a write-off with its reason', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'POST /api/stock/adjust': { balance: 1 } });
    renderWithSession(<AdjustForm itemType="MATERIAL" id="m1" onDone={() => undefined} />);
    await userEvent.clear(screen.getByLabelText('Изменение, шт.')); await userEvent.type(screen.getByLabelText('Изменение, шт.'), '-1');
    await userEvent.type(screen.getByLabelText('Причина'), 'Брак ткани');
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/stock/adjust')?.body).toEqual({ itemType: 'MATERIAL', id: 'm1', qtyDelta: -1, reason: 'Брак ткани' }));
  });
});
