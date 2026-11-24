import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export abstract class Mailer {
  abstract send(to: string, subject: string, html: string): Promise<void>;
}

/** Dev implementation: logs instead of sending. */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly log = new Logger('Mailer');
  async send(to: string, subject: string): Promise<void> {
    this.log.log(`mail to ${to}: ${subject}`);
  }
}

export class SmtpMailer extends Mailer {
  constructor(private readonly transport: Pick<nodemailer.Transporter, 'sendMail'>, private readonly from: string) { super(); }
  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, subject, html });
  }
}

/** SMTP when SMTP_URL is set (e.g. smtps://user:pass@smtp.example.com), otherwise the console logger. */
export function createMailer(): Mailer {
  const url = process.env.SMTP_URL;
  if (!url) return new ConsoleMailer();
  return new SmtpMailer(nodemailer.createTransport(url), process.env.MAIL_FROM ?? 'CarpetLAB <no-reply@localhost>');
}
