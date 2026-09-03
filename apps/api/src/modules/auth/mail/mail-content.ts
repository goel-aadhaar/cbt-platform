import {
  ContactMessageEmail,
  InvitationEmail,
  OtpEmail,
  WelcomeEmail,
} from './mail.service';

/**
 * Email copy (§2.6), shared by every transport adapter (SES, Resend, …).
 *
 * Content lives here, exactly once, so the two providers never drift —
 * before this split, adding a second adapter would have meant copying every
 * subject line and HTML body into a second file, and the two silently
 * disagreeing the first time either one was edited.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function invitationContent(email: InvitationEmail): EmailContent {
  const subject = email.institute
    ? `You're invited to join ${email.institute} on Codonmind Nexus`
    : "You're invited to Codonmind Nexus";
  const greeting = `Hi ${escapeHtml(email.name)},`;
  const body = email.institute
    ? `You've been invited to join <strong>${escapeHtml(email.institute)}</strong> as ${escapeHtml(roleLabel(email.role))}.`
    : `You've been invited to Codonmind Nexus as ${escapeHtml(roleLabel(email.role))}.`;

  return {
    subject,
    html: layout(`
      <p>${greeting}</p>
      <p>${body}</p>
      <p style="margin: 28px 0;">
        <a href="${email.inviteUrl}" style="${buttonStyle}">Accept invitation</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">
        If the button doesn't work, copy this link into your browser:<br />
        <a href="${email.inviteUrl}">${email.inviteUrl}</a>
      </p>
    `),
    text:
      `${greeting}\n\n` +
      `${stripHtml(body)}\n\n` +
      `Accept your invitation: ${email.inviteUrl}\n`,
  };
}

/** The code itself never appears in this module's OUTPUT log — only the
 * console adapter prints it, and only because dev has no other delivery. */
export function loginOtpContent(email: OtpEmail): EmailContent {
  const subject = `${email.code} is your Codonmind Nexus sign-in code`;
  return {
    subject,
    html: layout(`
      <p>Hi ${escapeHtml(email.name)},</p>
      <p>Use this code to finish signing in. It expires in ${email.expiresInMinutes} minutes.</p>
      <p style="margin: 28px 0; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">
        ${email.code}
      </p>
      <p style="color:#6b7280;font-size:13px;">
        Didn't try to sign in? You can ignore this email — the code will
        simply expire.
      </p>
    `),
    text:
      `Hi ${email.name},\n\n` +
      `Your Codonmind Nexus sign-in code: ${email.code}\n` +
      `Expires in ${email.expiresInMinutes} minutes.\n\n` +
      `Didn't try to sign in? You can ignore this email.\n`,
  };
}

/** Sent once, right after the invitee sets their password. Never includes
 * the password itself — email is not a secure channel and they just chose
 * it themselves — only the identifiers they need to sign in again. */
export function welcomeContent(email: WelcomeEmail): EmailContent {
  const subject = email.institute
    ? `Welcome to ${email.institute} on Codonmind Nexus`
    : 'Welcome to Codonmind Nexus';
  const details = [
    email.institute
      ? `<li><strong>Institute:</strong> ${escapeHtml(email.institute)}</li>`
      : '',
    // Labelled exactly as the sign-in form labels the field, so there is
    // nothing to work out: what the email calls Institute ID is what the box
    // on the screen calls Institute ID.
    email.instituteSlug
      ? `<li><strong>Institute ID:</strong> ${escapeHtml(email.instituteSlug)}</li>`
      : '',
    email.rollNumber
      ? `<li><strong>Roll number:</strong> ${escapeHtml(email.rollNumber)}</li>`
      : '',
    `<li><strong>Email:</strong> ${escapeHtml(email.to)}</li>`,
  ].join('');
  const detailsText = [
    email.institute ? `Institute: ${email.institute}\n` : '',
    email.instituteSlug ? `Institute ID: ${email.instituteSlug}\n` : '',
    email.rollNumber ? `Roll number: ${email.rollNumber}\n` : '',
    `Email: ${email.to}\n`,
  ].join('');

  return {
    subject,
    html: layout(`
      <p>Hi ${escapeHtml(email.name)},</p>
      <p>Thanks for accepting your invitation — your account is now active.</p>
      <ul style="padding-left:18px;color:#111827;">${details}</ul>
      <p style="margin: 28px 0;">
        <a href="${email.loginUrl}" style="${buttonStyle}">Sign in</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">
        If the button doesn't work, copy this link into your browser:<br />
        <a href="${email.loginUrl}">${email.loginUrl}</a>
      </p>
    `),
    text:
      `Hi ${email.name},\n\n` +
      `Thanks for accepting your invitation — your account is now active.\n\n` +
      detailsText +
      `\nSign in: ${email.loginUrl}\n`,
  };
}

/** A public contact-form submission, addressed to the business inbox — the
 * transport adapter is responsible for setting Reply-To to `email.email`. */
export function contactMessageContent(
  email: ContactMessageEmail,
): EmailContent {
  const subject = `New contact form message from ${email.name}`;
  const orgLine = email.organization
    ? `<p><strong>Organization:</strong> ${escapeHtml(email.organization)}</p>`
    : '';
  const orgLineText = email.organization
    ? `Organization: ${email.organization}\n`
    : '';

  return {
    subject,
    html: layout(`
      <p><strong>From:</strong> ${escapeHtml(email.name)} &lt;${escapeHtml(email.email)}&gt;</p>
      ${orgLine}
      <p style="white-space:pre-wrap;">${escapeHtml(email.message)}</p>
    `),
    text:
      `From: ${email.name} <${email.email}>\n` +
      orgLineText +
      `\n${email.message}\n`,
  };
}

const buttonStyle =
  'display:inline-block;background:#111827;color:#ffffff;text-decoration:none;' +
  'padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;';

function layout(inner: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <tr><td>
        <p style="font-weight:700;font-size:18px;margin:0 0 20px;">Codonmind Nexus</p>
        ${inner}
      </td></tr>
    </table>
  </body>
</html>`;
}

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}
