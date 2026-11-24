import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bwipjs from 'bwip-js';
import PdfPrinter from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts').pdfMake?.vfs ?? require('pdfmake/build/vfs_fonts');
const font = (name: string): Buffer => Buffer.from(vfs[name], 'base64');
const printer = new PdfPrinter({ Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') } });
const MM = 72 / 25.4;
export const MAX_COPIES = 200;

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  parseCopies(raw: string | undefined): number {
    if (raw === undefined) return 1;
    if (!/^\d+$/.test(raw)) throw new BadRequestException('Количество этикеток — целое число от 1 до 200');
    const n = Number(raw);
    if (n < 1 || n > MAX_COPIES) throw new BadRequestException('Количество этикеток — целое число от 1 до 200');
    return n;
  }

  async render(orgId: string, skuId: string, copies: number): Promise<Buffer> {
    const { sku, article, size } = await runInTenant(this.prisma, orgId, async (tx) => {
      const sku = await tx.sku.findUnique({ where: { id: skuId } });
      if (!sku) throw new NotFoundException();
      return { sku, article: await tx.article.findUniqueOrThrow({ where: { id: sku.articleId } }), size: await tx.sizeTemplate.findUniqueOrThrow({ where: { id: sku.sizeId } }) };
    });
    if (!sku.ean13) throw new ConflictException({ code: 'NO_BARCODE', message: 'У этого ковра нет штрихкода' });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const wPt = org.labelWidthMm * MM; const hPt = org.labelHeightMm * MM;
    const png = await bwipjs.toBuffer({ bcid: 'ean13', text: sku.ean13, scale: 3, height: 10, includetext: false });
    const image = `data:image/png;base64,${png.toString('base64')}`;

    const page = (last: boolean): Content[] => [
      { text: `${article.code} · ${article.name}`, fontSize: 7, bold: true, alignment: 'center' },
      { text: `${size.widthCm}×${size.lengthCm} см`, fontSize: 9, bold: true, alignment: 'center', margin: [0, 1, 0, 1] },
      { image, width: Math.max(40, wPt - 14), height: Math.max(14, hPt * 0.38), alignment: 'center' },
      { text: sku.ean13!, fontSize: 8, alignment: 'center', margin: [0, 1, 0, 0], ...(last ? {} : { pageBreak: 'after' as const }) },
    ];
    const def: TDocumentDefinitions = {
      pageSize: { width: wPt, height: hPt },
      pageMargins: [4, 3, 4, 3],
      defaultStyle: { font: 'Roboto' },
      content: Array.from({ length: copies }, (_, i) => page(i === copies - 1)).flat(),
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
