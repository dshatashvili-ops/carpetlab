import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Demo } from './Demo';

describe('Demo', () => {
  it('is read-only: no buttons or inputs, clearly marked as a demo', () => {
    const { container } = render(<MemoryRouter><Demo /></MemoryRouter>);
    expect(screen.getByText(/демо/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(container.querySelectorAll('svg rect.piece').length).toBeGreaterThan(0);
  });
});
