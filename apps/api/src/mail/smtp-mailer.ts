import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config.service';
import { Mailer, type MailMessage } from './mailer';

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfig) {
    super();
    this.from = config.get('EMAIL_FROM');
    this.transporter = createTransport({
      host: config.get('SMTP_HOST'),
      port: config.get('SMTP_PORT'),
      secure: config.get('SMTP_SECURE'),
      auth: { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
