import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { mockApi, renderWithSession, sessionHandlers } from '../testUtils';
import { DocumentEditForm, DocumentView, DocDetail } from './DocumentView';
import { Documents } from './Documents';
import { Problems } from './Problems';

const doc: DocDetail = {
  id: 'd1', number: 1, status: 'DONE', version: 1, articleId: 'a1', articleCode: '109029', articleName: 'Сахара', createdAt: '2027-01-10T09:00:00Z',
  lines: [{ sourceMaterialId: 'm1', sourceKind: 'ROLL', sourceWidthCm: 150, sourceLengthCm: 2500, sizeId: 's1', sizeWidthCm: 150, sizeLengthCm: 200, qty: 5 }],
  outputs: [{ skuId: 'k1', ean13: '4600123000015', widthCm: 150, lengthCm: 200, qty: 5 }],
  remnants: [{ materialId: 'm2', widthCm: 150, lengthCm: 1500, qty: 1 }],
};

describe('DocumentView', () => {
  it('shows lines, finished carpets with their barcode, the spec link and a label link', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/cuts/d1': doc, 'GET /api/cuts/d1/history': [], 'GET /api/cuts': [] });
    renderWithSession(<Routes><Route path="/app/documents/:id" element={<DocumentView />} /></Routes>, '/app/documents/d1');
    expect(await screen.findByRole('heading', { name: /Документ № 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Спецификация PDF' })).toHaveAttribute('href', '/api/cuts/d1/spec.pdf');
    expect(screen.getByText('4600123000015')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Этикетки' })).toHaveAttribute('href', '/api/skus/k1/label.pdf?copies=5');
    expect(screen.getByText(/Рулон 150 × 2500/)).toBeInTheDocument();
  });

  it('hides the edit button from a CUTTER', async () => {
    mockApi({ ...sessionHandlers('CUTTER'), 'GET /api/cuts/d1': doc, 'GET /api/cuts/d1/history': [], 'GET /api/cuts': [] });
    renderWithSession(<Routes><Route path="/app/documents/:id" element={<DocumentView />} /></Routes>, '/app/documents/d1');
    await screen.findByRole('heading', { name: /Документ № 1/ });
    expect(screen.queryByRole('button', { name: 'Исправить' })).not.toBeInTheDocument();
  });
});

describe('DocumentEditForm', () => {
  it('does not submit without a reason', async () => {
    const calls = mockApi(sessionHandlers());
    renderWithSession(<DocumentEditForm doc={doc} docs={[]} onSaved={() => undefined} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить правку' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите причину правки');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('sends the corrected quantities and the reason', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'PATCH /api/cuts/d1': { id: 'd1', version: 2, warnings: [] } });
    const saved = vi.fn();
    renderWithSession(<DocumentEditForm doc={doc} docs={[]} onSaved={saved} onCancel={() => undefined} />);
    const qty = screen.getByLabelText('Рулон 150 × 2500 → 150 × 200, шт.');
    await userEvent.clear(qty); await userEvent.type(qty, '4');
    await userEvent.type(screen.getByLabelText('Причина правки'), 'Один ковер в брак');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить правку' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ reason: 'Один ковер в брак', lines: [{ sourceMaterialId: 'm1', sizeId: 's1', qty: 4 }] });
  });

  it('sends the remnants only when they were edited', async () => {
    const calls = mockApi({ ...sessionHandlers(), 'PATCH /api/cuts/d1': { id: 'd1', version: 2, warnings: [] } });
    renderWithSession(<DocumentEditForm doc={doc} docs={[]} onSaved={() => undefined} onCancel={() => undefined} />);
    const len = screen.getByLabelText('Длина обрезка 1, см');
    await userEvent.clear(len); await userEvent.type(len, '1400');
    await userEvent.type(screen.getByLabelText('Причина правки'), 'Обрезок короче');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить правку' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ remnants: [{ widthCm: 150, lengthCm: 1400, qty: 1 }] });
  });

  it('after a conflicting save it says the change is saved and links the later documents', async () => {
    mockApi({ ...sessionHandlers(), 'PATCH /api/cuts/d1': { id: 'd1', version: 2, warnings: [{ itemType: 'MATERIAL', materialId: 'm2', balance: -1, laterDocumentIds: ['d2'] }] } });
    renderWithSession(<DocumentEditForm doc={doc} docs={[{ id: 'd2', number: 2 }]} onSaved={() => undefined} onCancel={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Причина правки'), 'Обрезка не было');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить правку' }));
    expect(await screen.findByText(/Изменение сохранено/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Документ № 2' })).toHaveAttribute('href', '/app/documents/d2');
  });
});

describe('Documents and Problems lists', () => {
  it('lists documents newest first with links', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/cuts': [{ id: 'd2', number: 2, articleCode: '109029', articleName: 'Сахара', version: 1, createdAt: '2027-01-11T09:00:00Z', createdByEmail: 'owner@example.com' }] });
    renderWithSession(<Documents />);
    expect(await screen.findByRole('link', { name: '№ 2' })).toHaveAttribute('href', '/app/documents/d2');
  });

  it('shows items with a negative balance and links the documents involved', async () => {
    mockApi({
      ...sessionHandlers(), 'GET /api/cuts': [{ id: 'd2', number: 2, articleCode: '109029', articleName: 'Сахара', version: 1, createdAt: '2027-01-11T09:00:00Z', createdByEmail: null }],
      'GET /api/stock/problems': [{ itemType: 'MATERIAL', materialId: 'm2', widthCm: 150, lengthCm: 1900, kind: 'REMNANT', balance: -1, documentIds: ['d2'] }],
    });
    renderWithSession(<Problems />);
    expect(await screen.findByText('150 × 1900')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '№ 2' })).toHaveAttribute('href', '/app/documents/d2');
  });

  it('says so when nothing is wrong', async () => {
    mockApi({ ...sessionHandlers(), 'GET /api/cuts': [], 'GET /api/stock/problems': [] });
    renderWithSession(<Problems />);
    expect(await screen.findByText(/Проблемных остатков нет/)).toBeInTheDocument();
  });
});
