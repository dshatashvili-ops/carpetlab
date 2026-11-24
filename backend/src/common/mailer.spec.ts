import nodemailer from 'nodemailer';
import { SmtpMailer } from './mailer';
import { appUrl } from './app-url';

describe('SmtpMailer', () => {
  it('sends through the transport with the configured sender, recipient, subject and html', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = spyOn(transport);
    await new SmtpMailer(transport, 'CarpetLAB <no-reply@carpetlab.example>').send('a@example.com', 'Тема', '<p>Привет</p>');
    expect(spy.calls[0]).toMatchObject({ from: 'CarpetLAB <no-reply@carpetlab.example>', to: 'a@example.com', subject: 'Тема', html: '<p>Привет</p>' });
  });
});

describe('appUrl', () => {
  const saved = process.env.APP_URL;
  afterEach(() => { if (saved === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved; });

  it('builds absolute links from APP_URL without a doubled slash', () => {
    process.env.APP_URL = 'https://carpetlab.example/';
    expect(appUrl('/accept-invite?token=abc')).toBe('https://carpetlab.example/accept-invite?token=abc');
  });

  it('falls back to the dev frontend address', () => {
    delete process.env.APP_URL;
    expect(appUrl('/app/billing')).toBe('http://localhost:5173/app/billing');
  });
});

function spyOn(transport: nodemailer.Transporter): { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  const original = transport.sendMail.bind(transport);
  (transport as unknown as { sendMail: unknown }).sendMail = (msg: Record<string, unknown>) => { calls.push(msg); return original(msg); };
  return { calls };
}
