// config/env.js — the only module that reads process.env.
//
// The app refuses to start on a missing or weak secret rather than falling
// back to a default: a predictable JWT secret lets anyone mint a vendor or
// admin token.
import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];

// Tests supply their own in-memory Mongo URI and secret, so validation is
// skipped there rather than duplicating config in the test setup.
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(
      `\n❌ Missing required environment variables: ${missing.join(', ')}\n` +
        '   Copy .env.example to .env and fill them in.\n'
    );
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.error(
      '\n❌ JWT_SECRET is too short. Use at least 32 random characters.\n' +
        '   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
}

const list = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest,
  port: Number(process.env.PORT) || 3000,

  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'test-secret-not-for-production-use-only',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),

  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:5173,http://localhost:5174'),

  smtp: {
    user: isTest ? '' : (process.env.SMTP_USER || ''),
    pass: isTest ? '' : (process.env.SMTP_PASS || ''),
    // An explicit host is what every transactional provider gives you (Brevo,
    // Resend, SES, Mailtrap). `service` is the Gmail-style shorthand, kept as
    // the default so an existing .env with only SMTP_USER/SMTP_PASS keeps
    // working without edits.
    host: isTest ? '' : (process.env.SMTP_HOST || ''),
    port: Number(process.env.SMTP_PORT) || 587,
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS, which nodemailer
    // does on its own when secure is false.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : Number(process.env.SMTP_PORT) === 465,
    service: process.env.SMTP_SERVICE || 'gmail',
    // With no credentials the code is logged to the server console instead, so
    // local development is never blocked on email delivery.
    enabled: isTest ? false : Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
  },

  mail: {
    // Gmail rewrites From to the authenticated account anyway, so a display
    // name is the only part worth setting there. A real provider honours it.
    from: process.env.MAIL_FROM || `ElectrOnia <${process.env.SMTP_USER || 'no-reply@electronia.local'}>`,
    replyTo: process.env.MAIL_REPLY_TO || '',
  },

  // Used to build links in email. Email has no request to infer an origin
  // from, so this has to be configured rather than derived.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),

  razorpay: {
    // The key id is public — it is handed to the browser to open Checkout.
    // The key secret signs and verifies, and must never leave the server.
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    // Set in the Razorpay dashboard when you create the webhook. It is a
    // DIFFERENT secret from the key secret, and signs the webhook body.
    // Without it, webhooks cannot be trusted and are rejected.
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  },

  otp: {
    ttlMs: 5 * 60 * 1000,
    maxAttempts: 5,
  },

  seedOnBoot: process.env.SEED_ON_BOOT !== 'false',
};
