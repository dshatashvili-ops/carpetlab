import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';

describe('routing', () => {
  it('sends a visitor without a session from /app to the login page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Требуется вход' }), text: async () => '' }) as unknown as typeof fetch;
    render(<MemoryRouter initialEntries={['/app']}><AppRoutes /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('renders the public home page at /', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => '' }) as unknown as typeof fetch;
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Раскрой рулонов без калькулятора' })).toBeInTheDocument();
  });
});
