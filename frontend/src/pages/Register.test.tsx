import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Register } from './Register';

describe('Register', () => {
  it('rejects a password shorter than 10 characters without calling the API', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    render(<MemoryRouter><Register /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.ru');
    await userEvent.type(screen.getByLabelText('Название организации'), 'Ковры+');
    await userEvent.type(screen.getByLabelText('Пароль'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Начать пробный период' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Пароль должен быть не короче 10 символов');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
