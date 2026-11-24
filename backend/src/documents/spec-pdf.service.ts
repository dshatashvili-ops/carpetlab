import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { DocumentsService } from './documents.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts').pdfMake?.vfs ?? require('pdfmake/build/vfs_fonts');
const font = (name: string): Buffer => Buffer.from(vfs[name], 'base64');

const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

const fmtDate = (d: Date): string => d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
const size = (w: number, l: number): string => `${w}×${l}`;

@Injectable()
export class SpecPdfService {
  constructor(private readonly docs: DocumentsService) {}

  async render(orgId: string, documentId: string): Promise<Buffer> {
    const d = await this.docs.get(orgId, documentId);
    const def: TDocumentDefinitions = {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      pageMargins: [36, 36, 36, 36],
      content: [
        { text: `Спецификация раскроя № ${d.number}`, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        { text: `Артикул ${d.articleCode} · ${d.articleName}`, margin: [0, 0, 0, 2] },
        { text: `Дата: ${fmtDate(d.createdAt)} · версия ${d.version}`, color: '#555555', margin: [0, 0, 0, 12] },
        { text: 'Что резать', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        {
          table: {
            headerRows: 1, widths: ['*', 'auto', 'auto'],
            body: [
              [{ text: 'Из чего (см)', bold: true }, { text: 'Размер ковра (см)', bold: true }, { text: 'Штук', bold: true }],
              ...d.lines.map((l) => [`${l.sourceKind === 'ROLL' ? 'Рулон' : 'Обрезок'} ${size(l.sourceWidthCm, l.sourceLengthCm)}`, size(l.sizeWidthCm, l.sizeLengthCm), String(l.qty)]),
            ],
          },
          margin: [0, 0, 0, 12],
        },
        { text: 'Готовые ковры', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        {
          table: {
            headerRows: 1, widths: ['auto', 'auto', '*'],
            body: [
              [{ text: 'Размер (см)', bold: true }, { text: 'Штук', bold: true }, { text: 'Штрихкод EAN-13', bold: true }],
              ...d.outputs.map((o) => [size(o.widthCm, o.lengthCm), String(o.qty), o.ean13 ?? '—']),
            ],
          },
          margin: [0, 0, 0, 12],
        },
        { text: 'Остаются обрезки', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
        d.remnants.length
          ? { ul: d.remnants.map((r) => `${size(r.widthCm, r.lengthCm)} см — ${r.qty} шт.`) }
          : { text: 'Нет', color: '#555555' },
      ],
    };
    return new Promise<Buffer>((resolve, reject) => {
      const doc = printer.createPdfKitDocument(def);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
