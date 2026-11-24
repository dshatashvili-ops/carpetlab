import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Pricing } from './Pricing';

describe('Pricing', () => {
  it('shows the three tariffs with limits and the configured prices', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ plans: [
        { plan: 1, articles: 10, employees: 3, photoMb: 100, prices: [{ months: 1, priceKopecks: 150_000 }] },
        { plan: 2, articles: 100, employees: 10, photoMb: 1024, prices: [] },
        { plan: 3, articles: 500, employees: 20, photoMb: 5120, prices: [] },
      ] }),
    }) as unknown as typeof fetch;
    render(<MemoryRouter><Pricing /></MemoryRouter>);
    expect(await screen.findByText('до 10 артикулов')).toBeInTheDocument();
    expect(screen.getByText('до 3 сотрудников')).toBeInTheDocument();
    expect(screen.getByText('до 500 артикулов')).toBeInTheDocument();
    expect(screen.getByText(/1\s?500\s?₽/)).toBeInTheDocument();
    expect(screen.getAllByText('Цена уточняется')).toHaveLength(2);
  });
});
