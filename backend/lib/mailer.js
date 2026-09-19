// lib/mailer.js — outbound email.
//
// WHAT THIS REPLACES
//
// Email used to be four lines inside auth.service.js: a nodemailer transport
// hardcoded to `service: 'gmail'`, and a one-line plain-text OTP. Three
// problems with that:
//
//   1. It only worked with Gmail. A real deployment uses a transactional
//      provider (Brevo, Resend, SES, Mailtrap in staging), all of which are
//      plain SMTP host/port.
//   2. A send failure propagated into the signup request, so an email outage
//      became "signup is broken".
//   3. A plain-text code has no branding and lands in spam more often than a
//      properly structured multipart message.
//
// Now: one transport, built once from config; every template renders both HTML
// and a text alternative; and `send()` never throws — it returns a result the
// caller can log. Whether an email went out is never allowed to decide whether
// an account was created.
//
// With no SMTP credentials the message is logged to the server console
// instead, so development and tests are never blocked on a mail provider.
import nodemailer from 'nodemailer';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------- transport

let transporter = null;

if (env.smtp.enabled) {
  transporter = nodemailer.createTransport(
    // An explicit host always wins. `service` is the shorthand for Gmail and
    // friends, kept so an existing .env with only SMTP_USER/SMTP_PASS still
    // works without edits.
    env.smtp.host
      ? {
          host: env.smtp.host,
          port: env.smtp.port,
          secure: env.smtp.secure,
          auth: { user: env.smtp.user, pass: env.smtp.pass },
        }
      : {
          service: env.smtp.service,
          auth: { user: env.smtp.user, pass: env.smtp.pass },
        }
  );
}

/**
 * Checks the credentials once at boot so a typo shows up in the startup log
 * rather than the first time somebody tries to sign up.
 */
export async function verifyMailer() {
  if (!transporter) {
    // Deliberately loud, and it names the .env-was-edited-but-not-reloaded
    // case, because that is the failure that looks like working software:
    // signup succeeds, the console has the code, and no email is ever sent.
    logger.warn(
      '\n' +
        '  ─────────────────────────────────────────────────────────────────\n' +
        '  EMAIL IS OFF. Verification codes are printed to THIS console.\n' +
        '\n' +
        '  SMTP_USER / SMTP_PASS were not set in the environment this\n' +
        '  process started with.\n' +
        '\n' +
        '  If you just added them to .env, this process has not picked them\n' +
        '  up — nodemon does not watch .env by default. Restart the API.\n' +
        '  (backend/nodemon.json now watches .env, so a restart fixes it\n' +
        '  for good.)\n' +
        '\n' +
        '  Check delivery without creating an account:\n' +
        '      npm run mail:test -- you@example.com\n' +
        '  ─────────────────────────────────────────────────────────────────'
    );
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    await transporter.verify();
    logger.info(
      { from: env.mail.from, via: env.smtp.host || `service:${env.smtp.service}` },
      'SMTP ready — verification emails will be sent'
    );
    return { ok: true };
  } catch (err) {
    // Not fatal. The app runs; email degrades to console.
    logger.error(
      { err: err.message },
      'SMTP credentials were REJECTED — email falls back to this console. ' +
        'For Gmail this is almost always an ordinary account password where a ' +
        '16-character App Password is required, or 2-Step Verification being off. ' +
        'Run `npm run mail:test` for the specific reason.'
    );
    return { ok: false, reason: 'AUTH_FAILED', error: err.message };
  }
}

/** True when SMTP credentials were loaded, i.e. mail will actually leave this server. */
export function isMailConfigured() {
  return Boolean(transporter);
}

/**
 * Sends one message. Never throws: the return value says what happened.
 *
 * @param {{to: string, subject: string, html: string, text: string}} message
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: string}>}
 */
export async function send({ to, subject, html, text }) {
  if (!transporter) {
    logger.info({ to, subject, text }, 'Email (dev: not sent, SMTP not configured)');
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    const info = await transporter.sendMail({
      from: env.mail.from,
      to,
      subject,
      text,
      html,
      replyTo: env.mail.replyTo || undefined,
    });
    logger.info({ to, subject, messageId: info.messageId }, 'Email sent');
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ err: err.message, to, subject }, 'Email failed');
    return { sent: false, reason: 'SEND_FAILED', error: err.message };
  }
}

// ---------------------------------------------------------------- templates
//
// Email HTML is not web HTML. Outlook renders with Word, Gmail strips <style>
// blocks and external stylesheets, and flexbox and grid are unsupported in
// several clients. So: tables for layout, every style inline, and no external
// assets. Each template also returns plain text, because a message with no
// text alternative scores worse with spam filters and is unreadable in a
// text-only client.

const BRAND = {
  ink: '#101418',
  blue: '#2D2BF5',
  muted: '#6B7280',
  hairline: '#E5E7EB',
  surface: '#F7F8FA',
};

/** Escaped, because a person's name goes into this markup. */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** One shell for every message, so they all look like the same sender. */
function layout({ preheader, heading, body, footnote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <!-- The preheader is the grey line an inbox shows after the subject. Left
       out, clients scrape the first words of the body instead. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.hairline};border-radius:8px;">

          <tr>
            <td style="padding:24px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${BRAND.blue};width:26px;height:26px;border-radius:5px;text-align:center;vertical-align:middle;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;">E</td>
                  <td style="padding-left:9px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:${BRAND.ink};letter-spacing:-0.2px;">ElectrOnia</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 0 28px;font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:1.3;font-weight:bold;color:${BRAND.ink};">
              ${esc(heading)}
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px 26px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
              ${body}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${BRAND.hairline};font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${BRAND.muted};">
              ${footnote ?? 'You are receiving this because an ElectrOnia account was created with this email address.'}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const templates = {
  /**
   * The verification code. Deliberately contains no link: a code the person
   * types cannot be clicked by a mail scanner, and there is nothing here for a
   * phishing lookalike to imitate.
   */
  verificationCode({ code, minutes = 5, name }) {
    const greeting = name ? `Hi ${esc(name)},` : 'Hi,';

    return {
      subject: `${code} is your ElectrOnia verification code`,
      text: [
        `${name ? `Hi ${name},` : 'Hi,'}`,
        '',
        `Your ElectrOnia verification code is ${code}`,
        '',
        `It expires in ${minutes} minutes and can be used once.`,
        'If you did not request this, you can ignore this email — no account is created without the code.',
        '',
        '— ElectrOnia',
      ].join('\n'),
      html: layout({
        preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
        heading: 'Confirm your email address',
        body: `
          <p style="margin:0 0 16px 0;">${greeting}</p>
          <p style="margin:0 0 18px 0;">Enter this code to finish creating your account:</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
            <tr>
              <td style="background:${BRAND.surface};border:1px solid ${BRAND.hairline};border-radius:6px;padding:16px 26px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:7px;color:${BRAND.ink};">
                ${esc(code)}
              </td>
            </tr>
          </table>

          <p style="margin:0 0 10px 0;color:${BRAND.muted};">
            The code expires in ${minutes} minutes and works only once.
          </p>
          <p style="margin:0;color:${BRAND.muted};">
            Didn't ask for this? You can ignore this email — no account is created without the code.
          </p>`,
        footnote:
          'ElectrOnia will never ask you for this code by phone, chat or reply. Nobody from ElectrOnia needs it.',
      }),
    };
  },

  /**
   * Forgot-password code. Like the signup code: no link, just the number, and
   * a plain "ignore this if it wasn't you" — nothing changes without the code.
   */
  passwordResetCode({ code, name, minutes = 15, role = 'customer' }) {
    const who = role === 'vendor' ? 'vendor account' : 'account';
    return {
      subject: `${code} is your ElectrOnia password reset code`,
      text: [
        `Hi ${name || 'there'},`,
        '',
        `Someone asked to reset the password on your ElectrOnia ${who}.`,
        `Your code is ${code}`,
        '',
        `It expires in ${minutes} minutes and works once.`,
        'If this was not you, ignore this email — your password stays the same.',
        '',
        '— ElectrOnia',
      ].join('\n'),
      html: layout({
        preheader: `Your reset code is ${code}. It expires in ${minutes} minutes.`,
        heading: 'Reset your password',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name || 'there')},</p>
          <p style="margin:0 0 18px 0;">Someone asked to reset the password on your ElectrOnia ${who}. Enter this code to choose a new one:</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
            <tr>
              <td style="background:${BRAND.surface};border:1px solid ${BRAND.hairline};border-radius:6px;padding:16px 26px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:7px;color:${BRAND.ink};">
                ${esc(code)}
              </td>
            </tr>
          </table>

          <p style="margin:0 0 10px 0;color:${BRAND.muted};">The code expires in ${minutes} minutes and works only once.</p>
          <p style="margin:0;color:${BRAND.muted};">Didn't ask for this? Ignore this email — your password has not changed and won't without the code.</p>`,
        footnote:
          'ElectrOnia will never ask you for this code by phone, chat or reply. Nobody from ElectrOnia needs it.',
      }),
    };
  },

  /** Sent after every successful reset, so a reset the owner didn't make gets noticed. */
  passwordChanged({ name, role = 'customer', appUrl, at = new Date() }) {
    const when = new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    const loginUrl = role === 'vendor' ? `${appUrl}/loginvendor` : `${appUrl}/logincustomer`;
    return {
      subject: 'Your ElectrOnia password was changed',
      text: [
        `Hi ${name || 'there'},`,
        '',
        `The password on your ElectrOnia ${role === 'vendor' ? 'vendor ' : ''}account was changed on ${when} (IST).`,
        '',
        'If that was you, there is nothing else to do.',
        `If it was not, reset it again straight away from ${loginUrl} ("Forgot password?") and reply to this email so we can look into it.`,
        '',
        '— ElectrOnia',
      ].join('\n'),
      html: layout({
        preheader: 'Your password was just changed.',
        heading: 'Your password was changed',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name || 'there')},</p>
          <p style="margin:0 0 16px 0;">The password on your ElectrOnia ${role === 'vendor' ? 'vendor ' : ''}account was changed on <strong>${esc(when)} (IST)</strong>.</p>
          <p style="margin:0 0 16px 0;">If that was you, there is nothing else to do.</p>
          <p style="margin:0 0 20px 0;">If it wasn't, reset it again straight away and reply to this email so we can look into it.</p>
          ${button(loginUrl, 'Go to sign in')}`,
        footnote: 'You are receiving this because the password on your ElectrOnia account was changed.',
      }),
    };
  },

  /** Sent once, after the account actually exists. */
  welcome({ name, role = 'customer', appUrl }) {
    const isVendor = role === 'vendor';
    const cta = isVendor ? 'Open your vendor dashboard' : 'Start shopping';
    const ctaUrl = isVendor ? `${appUrl}/vendor/dashboard` : `${appUrl}/products`;

    const points = isVendor
      ? [
          'List products with photos, specifications, stock and pricing.',
          'Track orders for your own listings — you only ever see your lines.',
          'Watch revenue, units sold and low-stock items on one dashboard.',
        ]
      : [
          'Your cart is saved to your account, so it follows you between devices.',
          'Save delivery addresses once and reuse them at every checkout.',
          'Track each order per shipment — a multi-vendor order ships separately.',
        ];

    return {
      subject: isVendor
        ? 'Your ElectrOnia vendor account is ready'
        : 'Welcome to ElectrOnia',
      text: [
        `Hi ${name},`,
        '',
        isVendor
          ? 'Your vendor account is ready. You can start listing products right away.'
          : 'Your account is ready.',
        '',
        ...points.map((point) => `• ${point}`),
        '',
        `${cta}: ${ctaUrl}`,
        '',
        '— ElectrOnia',
      ].join('\n'),
      html: layout({
        preheader: isVendor
          ? 'Your vendor account is ready — start listing products.'
          : 'Your account is ready.',
        heading: isVendor ? 'Your vendor account is ready' : `Welcome, ${esc(name)}`,
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name)},</p>
          <p style="margin:0 0 18px 0;">
            ${
              isVendor
                ? 'Your vendor account is verified and active. You can list your first product now.'
                : 'Your email is verified and your account is active. Here is what it gets you:'
            }
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
            ${points
              .map(
                (point) => `<tr>
              <td style="padding:0 10px 10px 0;vertical-align:top;color:${BRAND.blue};font-weight:bold;">•</td>
              <td style="padding:0 0 10px 0;vertical-align:top;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#374151;">${point}</td>
            </tr>`
              )
              .join('')}
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:${BRAND.ink};border-radius:6px;">
                <a href="${esc(ctaUrl)}" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${cta} →</a>
              </td>
            </tr>
          </table>`,
        footnote: `You are receiving this because an ElectrOnia ${isVendor ? 'vendor ' : ''}account was created with this email address.`,
      }),
    };
  },

  /** Order confirmation. Every figure is a label the API already formatted. */
  orderPlaced({ name, orderId, items, totalLabel, address, appUrl }) {
    const rows = items
      .map(
        (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.hairline};font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">
          ${esc(item.title)}
          <span style="color:${BRAND.muted};"> × ${esc(item.quantity)}</span>
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid ${BRAND.hairline};font-family:'Courier New',Courier,monospace;font-size:13px;color:${BRAND.ink};white-space:nowrap;">
          ${esc(item.lineTotalLabel)}
        </td>
      </tr>`
      )
      .join('');

    const shortId = String(orderId).slice(-8).toUpperCase();

    return {
      subject: `Order ${shortId} confirmed — ElectrOnia`,
      text: [
        `Hi ${name},`,
        '',
        `Your order ${shortId} is confirmed.`,
        '',
        ...items.map((item) => `${item.title} × ${item.quantity} — ${item.lineTotalLabel}`),
        '',
        `Total: ${totalLabel}`,
        address ? `Delivering to: ${address}` : '',
        '',
        `Track it: ${appUrl}/orders`,
        '',
        '— ElectrOnia',
      ]
        .filter(Boolean)
        .join('\n'),
      html: layout({
        preheader: `Order ${shortId} · ${totalLabel}`,
        heading: 'Your order is confirmed',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name)},</p>
          <p style="margin:0 0 18px 0;">
            Order <strong style="font-family:'Courier New',Courier,monospace;">${esc(shortId)}</strong> is confirmed.
            Items from different vendors ship separately, and each shipment is tracked on its own.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px 0;">
            ${rows}
            <tr>
              <td style="padding:12px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.ink};">Total</td>
              <td align="right" style="padding:12px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:bold;color:${BRAND.ink};">${esc(totalLabel)}</td>
            </tr>
          </table>

          ${
            address
              ? `<p style="margin:20px 0 0 0;color:${BRAND.muted};font-size:13px;">
                   <strong style="color:${BRAND.ink};">Delivering to</strong><br>${esc(address)}
                 </p>`
              : ''
          }

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
            <tr>
              <td style="background:${BRAND.ink};border-radius:6px;">
                <a href="${esc(appUrl)}/orders" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">Track this order →</a>
              </td>
            </tr>
          </table>`,
        footnote: 'You are receiving this because you placed an order on ElectrOnia.',
      }),
    };
  },

  /**
   * One package is on its way. Says WHICH items — in a multi-vendor order the
   * rest may still be being packed, and "your order has shipped" would be
   * untrue.
   */
  orderShipped({ name, orderId, items, carrierName, trackingNumber, trackingUrl, trackingLinkKind, appUrl }) {
    const shortId = String(orderId).slice(-8).toUpperCase();
    const list = itemList(items);
    // Only an exact link is labelled "Track". A carrier's home page is labelled
    // as what it is, and the number is shown to paste.
    const trackLabel = trackingLinkKind === 'exact' ? 'Track your package' : `Open ${carrierName}`;

    return {
      subject: `Shipped: ${items.length === 1 ? items[0].title : `${items.length} items`} from order ${shortId}`,
      text: [
        `Hi ${name},`,
        '',
        `Part of your order ${shortId} is on its way with ${carrierName}:`,
        '',
        ...items.map((item) => `• ${item.title} × ${item.quantity}`),
        '',
        trackingNumber ? `Tracking number: ${trackingNumber}` : '',
        trackingUrl ? `${trackLabel}: ${trackingUrl}` : '',
        `All your orders: ${appUrl}/orders`,
        '',
        '— ElectrOnia',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      html: layout({
        preheader: `${carrierName}${trackingNumber ? ` · ${trackingNumber}` : ''}`,
        heading: 'Your package is on its way',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name)},</p>
          <p style="margin:0 0 16px 0;">
            These items from order <strong style="font-family:'Courier New',Courier,monospace;">${esc(shortId)}</strong>
            have been handed to <strong>${esc(carrierName)}</strong>:
          </p>
          ${list}
          ${
            trackingNumber
              ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${BRAND.muted};padding-bottom:4px;">Tracking number</td></tr>
                  <tr><td style="background:${BRAND.surface};border:1px solid ${BRAND.hairline};border-radius:6px;padding:10px 16px;font-family:'Courier New',Courier,monospace;font-size:18px;font-weight:bold;letter-spacing:1px;color:${BRAND.ink};">${esc(trackingNumber)}</td></tr>
                </table>`
              : ''
          }
          ${trackingUrl ? button(trackingUrl, trackLabel) : ''}
          <p style="margin:18px 0 0 0;color:${BRAND.muted};font-size:13px;">
            Items from other sellers in this order ship separately, and you will get a separate email for each.
          </p>`,
        footnote: 'You are receiving this because you placed an order on ElectrOnia.',
      }),
    };
  },

  orderDelivered({ name, orderId, items, appUrl }) {
    const shortId = String(orderId).slice(-8).toUpperCase();
    return {
      subject: `Delivered: ${items.length === 1 ? items[0].title : `${items.length} items`} from order ${shortId}`,
      text: [
        `Hi ${name},`,
        '',
        `These items from order ${shortId} have been delivered:`,
        '',
        ...items.map((item) => `• ${item.title} × ${item.quantity}`),
        '',
        `If anything is wrong, reply to this email. Your orders: ${appUrl}/orders`,
        '',
        '— ElectrOnia',
      ].join('\n'),
      html: layout({
        preheader: `Order ${shortId} — delivered`,
        heading: 'Delivered',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name)},</p>
          <p style="margin:0 0 16px 0;">These items from order <strong style="font-family:'Courier New',Courier,monospace;">${esc(shortId)}</strong> have been delivered:</p>
          ${itemList(items)}
          <p style="margin:0 0 18px 0;color:${BRAND.muted};">If anything arrived damaged or is missing, reply to this email.</p>
          ${button(`${appUrl}/orders`, 'View your orders')}`,
        footnote: 'You are receiving this because you placed an order on ElectrOnia.',
      }),
    };
  },

  /** A package — or the whole order — will not be sent. */
  packageCancelled({ name, orderId, items, reason, refundDue, appUrl }) {
    const shortId = String(orderId).slice(-8).toUpperCase();
    const refundLine = refundDue
      ? 'You paid online, so the amount for these items will be refunded to your original payment method.'
      : 'Nothing was charged for these items.';

    return {
      subject: `Cancelled: ${items.length === 1 ? items[0].title : `${items.length} items`} from order ${shortId}`,
      text: [
        `Hi ${name},`,
        '',
        `These items from order ${shortId} have been cancelled:`,
        '',
        ...items.map((item) => `• ${item.title} × ${item.quantity}`),
        '',
        reason ? `Reason: ${reason}` : '',
        refundLine,
        '',
        `Your orders: ${appUrl}/orders`,
        '',
        '— ElectrOnia',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      html: layout({
        preheader: `Order ${shortId} — items cancelled`,
        heading: 'Items cancelled',
        body: `
          <p style="margin:0 0 16px 0;">Hi ${esc(name)},</p>
          <p style="margin:0 0 16px 0;">These items from order <strong style="font-family:'Courier New',Courier,monospace;">${esc(shortId)}</strong> have been cancelled:</p>
          ${itemList(items)}
          ${reason ? `<p style="margin:0 0 12px 0;"><strong>Reason:</strong> ${esc(reason)}</p>` : ''}
          <p style="margin:0 0 18px 0;color:${BRAND.muted};">${esc(refundLine)}</p>
          ${button(`${appUrl}/orders`, 'View your orders')}`,
        footnote: 'You are receiving this because you placed an order on ElectrOnia.',
      }),
    };
  },
};

function itemList(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
    ${items
      .map(
        (item) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${BRAND.hairline};font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">
          ${esc(item.title)}<span style="color:${BRAND.muted};"> × ${esc(item.quantity)}</span>
        </td></tr>`
      )
      .join('')}
  </table>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:${BRAND.ink};border-radius:6px;">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${esc(label)} →</a>
    </td></tr>
  </table>`;
}

/**
 * Fire-and-forget. For mail that must never delay or fail the request it
 * belongs to — a welcome email is not worth a failed signup.
 */
export function sendInBackground(message, context = {}) {
  send(message).catch((err) => {
    logger.error({ err: err.message, ...context }, 'Background email threw');
  });
}
