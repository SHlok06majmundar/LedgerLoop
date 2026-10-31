export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

/** Sends one email. Implementations throw when the provider rejects the message. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
