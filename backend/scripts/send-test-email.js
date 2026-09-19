// scripts/send-test-email.js — prove email works before trusting signup to it.
//
//   npm run mail:test                        → sends to SMTP_USER
//   npm run mail:test -- you@example.com     → sends to that address
//   npm run mail:test -- you@example.com welcome
//
// Templates: code (default), welcome, vendor-welcome, order.
//
// WHY THIS EXISTS
//
// Debugging email through the signup form means creating a throwaway account
// every attempt, and a Gmail App Password typo looks exactly like "the OTP
// never arrived". This does one round trip and tells you which step failed:
// credentials rejected, or accepted and delivered.
//
// It sends all four templates' HTML through the real transport, so it also
// catches a template that renders correctly in a test and badly in an inbox.
import { env } from '../config/env.js';
import { send, verifyMailer, templates } from '../lib/mailer.js';

const [, , addressArg, templateArg = 'code'] = process.argv;
const to = addressArg || env.smtp.user;

if (!to) {
  console.error(
    '\n❌ No address to send to.\n' +
      '   Either set SMTP_USER in .env, or pass one:\n' +
      '   npm run mail:test -- you@example.com\n'
  );
  process.exit(1);
}

console.log(`\nSMTP:  ${env.smtp.host || `service:${env.smtp.service}`}`);
console.log(`From:  ${env.mail.from}`);
console.log(`To:    ${to}`);
console.log(`Which: ${templateArg}\n`);

const check = await verifyMailer();

if (!check.ok && check.reason === 'NOT_CONFIGURED') {
  console.error(
    '❌ SMTP is not configured, so nothing can be sent.\n\n' +
      '   Add these to backend/.env:\n\n' +
      '     SMTP_USER=your.address@gmail.com\n' +
      '     SMTP_PASS=your-16-character-app-password\n' +
      '     MAIL_FROM=ElectrOnia <your.address@gmail.com>\n\n' +
      '   For Gmail, SMTP_PASS must be an App Password, not your account\n' +
      '   password: Google Account → Security → 2-Step Verification →\n' +
      '   App passwords. Ordinary passwords are rejected outright.\n'
  );
  process.exit(1);
}

if (!check.ok) {
  console.error(
    `❌ The mail server rejected these credentials: ${check.error}\n\n` +
      '   For Gmail this is almost always one of:\n' +
      '     • SMTP_PASS is the account password, not a 16-character App Password\n' +
      '     • 2-Step Verification is off, so App Passwords cannot be created\n' +
      '     • the App Password still has its spaces in it — remove them\n'
  );
  process.exit(1);
}

const message = {
  code: () => templates.verificationCode({ code: '284917', minutes: 5, name: 'Shravani' }),
  welcome: () => templates.welcome({ name: 'Shravani', role: 'customer', appUrl: env.appUrl }),
  'vendor-welcome': () => templates.welcome({ name: 'Nagpur Electronics', role: 'vendor', appUrl: env.appUrl }),
  order: () =>
    templates.orderPlaced({
      name: 'Shravani',
      orderId: '66f1a2b3c4d5e6f708192a3b',
      items: [
        { title: 'MacBook Air 15" M3', quantity: 1, lineTotalLabel: '₹1,49,900.00' },
        { title: 'Sony WH-1000XM5', quantity: 2, lineTotalLabel: '₹53,980.00' },
      ],
      totalLabel: '₹2,40,656.20',
      address: 'Flat 402, Sai Residency, Nagpur, Maharashtra, 440015',
      appUrl: env.appUrl,
    }),
}[templateArg];

if (!message) {
  console.error(`❌ Unknown template "${templateArg}". Use: code, welcome, vendor-welcome, order.`);
  process.exit(1);
}

const result = await send({ to, ...message() });

if (result.sent) {
  console.log(`\n✅ Sent. Message id: ${result.messageId}`);
  console.log('   Check the inbox — and the spam folder, which is where the first one usually lands.\n');
  process.exit(0);
}

console.error(`\n❌ Send failed: ${result.error ?? result.reason}\n`);
process.exit(1);
