import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type RemoteStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

export abstract class YooKassaClient {
  abstract createPayment(input: { amountKopecks: number; description: string; returnUrl: string; idempotenceKey: string }): Promise<{ id: string; confirmationUrl: string }>;
  /** Returns the payment as YooKassa knows it, or null if it does not exist. The only trustworthy source of a payment's status. */
  abstract getPayment(id: string): Promise<{ id: string; status: RemoteStatus } | null>;
}

const API = 'https://api.yookassa.ru/v3/payments';
const rubles = (kopecks: number): string => `${Math.floor(kopecks / 100)}.${String(kopecks % 100).padStart(2, '0')}`;

@Injectable()
export class HttpYooKassaClient extends YooKassaClient {
  private auth(): string {
    const shop = process.env.YOOKASSA_SHOP_ID; const key = process.env.YOOKASSA_SECRET_KEY;
    if (!shop || !key) throw new ServiceUnavailableException('Оплата картой временно недоступна');
    return `Basic ${Buffer.from(`${shop}:${key}`).toString('base64')}`;
  }

  async createPayment(input: { amountKopecks: number; description: string; returnUrl: string; idempotenceKey: string }) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: this.auth(), 'Content-Type': 'application/json', 'Idempotence-Key': input.idempotenceKey || randomUUID() },
      body: JSON.stringify({
        amount: { value: rubles(input.amountKopecks), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: input.description,
      }),
    });
    if (!res.ok) throw new ServiceUnavailableException('Не удалось создать платеж, попробуйте позже');
    const body = (await res.json()) as { id: string; confirmation?: { confirmation_url?: string } };
    if (!body.confirmation?.confirmation_url) throw new ServiceUnavailableException('Платежный сервис не вернул ссылку на оплату');
    return { id: body.id, confirmationUrl: body.confirmation.confirmation_url };
  }

  async getPayment(id: string) {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { Authorization: this.auth() } });
    if (res.status === 404) return null;
    if (!res.ok) throw new ServiceUnavailableException('Не удалось проверить платеж');
    const body = (await res.json()) as { id: string; status: RemoteStatus };
    return { id: body.id, status: body.status };
  }
}
