import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderWithSession, sessionHandlers } from '../testUtils';
import { Articles } from './Articles';

const article = { id: 'a1', code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: true };

describe('Articles', () => {
  it('lists articles and the stock filter asks the API for stock=inStock', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/articles': [article] });
    renderWithSession(<Articles />);
    expect(await screen.findByText('109029')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Остатки'), 'inStock');
    await waitFor(() => expect(calls.some((c) => c.url.includes('stock=inStock'))).toBe(true));
  });

  it('searching sends ?q= after the user types', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/articles': [article] });
    renderWithSession(<Articles />);
    await screen.findByText('109029');
    await userEvent.type(screen.getByLabelText('Поиск'), '1090');
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=1090'))).toBe(true));
  });

  it('a CUTTER sees the list but not the "Новый артикул" button', async () => {
    mockApi({ ...sessionHandlers('CUTTER'), 'GET /api/articles': [article] });
    renderWithSession(<Articles />);
    await screen.findByText('109029');
    expect(screen.queryByRole('button', { name: 'Новый артикул' })).not.toBeInTheDocument();
  });

  it('creating an article posts the form values', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'GET /api/articles': [], 'POST /api/articles': { ...article } });
    renderWithSession(<Articles />);
    await userEvent.click(await screen.findByRole('button', { name: 'Новый артикул' }));
    await userEvent.type(screen.getByLabelText('Артикул'), '109029');
    await userEvent.type(screen.getByLabelText('Название'), 'Сахара');
    await userEvent.type(screen.getByLabelText('Ширина рулона, см'), '150');
    await userEvent.selectOptions(screen.getByLabelText('Режим резки'), 'LINEAR');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/articles')?.body).toMatchObject({ code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' }));
  });
});
