import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderWithSession, sessionHandlers } from '../testUtils';
import { Sizes } from './Sizes';

describe('Sizes', () => {
  it('lists templates and adds a new one', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/sizes': [{ id: 's1', widthCm: 150, lengthCm: 200 }], 'POST /api/sizes': { id: 's2', widthCm: 150, lengthCm: 300 } });
    renderWithSession(<Sizes />);
    expect(await screen.findByText('150 × 200')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Ширина, см'), '150');
    await userEvent.type(screen.getByLabelText('Длина, см'), '300');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/sizes')?.body).toEqual({ widthCm: 150, lengthCm: 300 }));
  });
});
