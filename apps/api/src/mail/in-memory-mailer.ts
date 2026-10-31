import { Injectable } from '@nestjs/common';
import { Mailer, type MailMessage } from './mailer';

/** Test adapter that keeps sent mail in memory. */
@Injectable()
export class InMemoryMailer extends Mailer {
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
  }

  lastTo(email: string): MailMessage | undefined {
    return this.outbox.filter((m) => m.to === email).at(-1);
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
