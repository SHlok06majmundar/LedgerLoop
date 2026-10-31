import type { MailMessage } from './mailer';

type Template = Omit<MailMessage, 'to' | 'attachments'>;

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escape(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escape(action.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;color:#0f766e">LedgerLoop</p>
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>${body}${button}
</div></body></html>`;
  const text = [
    title,
    '',
    ...paragraphs,
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
  ].join('\n');
  return { html, text };
}

export function verifyEmailTemplate(name: string, url: string): Template {
  return {
    subject: 'Verify your LedgerLoop email',
    ...layout(
      'Confirm your email address',
      [`Hi ${name},`, 'Confirm your email to finish setting up your LedgerLoop account.'],
      { label: 'Verify email', url },
    ),
  };
}

export function resetPasswordTemplate(name: string, url: string): Template {
  return {
    subject: 'Reset your LedgerLoop password',
    ...layout(
      'Reset your password',
      [
        `Hi ${name},`,
        'We received a request to reset your password. This link expires in one hour.',
        'If you did not ask for this, you can ignore this email.',
      ],
      { label: 'Reset password', url },
    ),
  };
}

export function invitationTemplate(
  orgName: string,
  inviterName: string,
  role: string,
  url: string,
): Template {
  return {
    subject: `You're invited to ${orgName} on LedgerLoop`,
    ...layout(
      `Join ${orgName}`,
      [
        `${inviterName} invited you to join ${orgName} as ${role.toLowerCase()}.`,
        'This invitation expires in 7 days.',
      ],
      { label: 'Accept invitation', url },
    ),
  };
}

export function plainTemplate(subject: string, title: string, paragraphs: string[]): Template {
  return { subject, ...layout(title, paragraphs) };
}
