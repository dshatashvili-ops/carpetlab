import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from './Home';

describe('Home', () => {
  it('shows the headline and the two calls to action', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Раскрой рулонов без калькулятора' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Попробовать 7 дней' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Открыть демо' })).toHaveAttribute('href', '/demo');
  });
});
