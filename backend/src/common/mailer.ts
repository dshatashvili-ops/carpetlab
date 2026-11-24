import { Injectable, Logger } from '@nestjs/common';

export abstract class Mailer {
  abstract send(to: string, subject: string, html: string): Promise<void>;
}

/** Dev implementation: logs instead of sending. Replace with SMTP in production. */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly log = new Logger('Mailer');
  async send(to: string, subject: string): Promise<void> {
    this.log.log(`mail to ${to}: ${subject}`);
  }
}
