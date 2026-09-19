// tests/unit/mailer.test.js
//
// Email is the one output nobody looks at until a customer complains, so the
// parts that can be checked without a mail server are checked here: that each
// template renders complete HTML and a text alternative, that a name cannot
// break out of the markup, and that `send()` degrades instead of throwing when
// SMTP is not configured — which is the state every test and fresh clone is in.
import { templates, send, verifyMailer } from '../../lib/mailer.js';

const ORDER = {
  name: 'Shravani',
  orderId: '66f1a2b3c4d5e6f708192a3b',
  items: [
    { title: 'MacBook Air 15" M3', quantity: 1, lineTotalLabel: '₹1,49,900.00' },
    { title: 'Sony WH-1000XM5', quantity: 2, lineTotalLabel: '₹53,980.00' },
  ],
  totalLabel: '₹2,40,656.20',
  address: 'Flat 402, Nagpur, Maharashtra, 440015',
  appUrl: 'https://electronia.example',
};

const ALL = () => [
  ['verificationCode', templates.verificationCode({ code: '284917', minutes: 5, name: 'Shravani' })],
  ['welcome', templates.welcome({ name: 'Shravani', role: 'customer', appUrl: ORDER.appUrl })],
  ['welcome-vendor', templates.welcome({ name: 'Nagpur Electronics', role: 'vendor', appUrl: ORDER.appUrl })],
  ['orderPlaced', templates.orderPlaced(ORDER)],
];

describe('every template', () => {
  it('returns a subject, HTML and a text alternative', () => {
    for (const [name, message] of ALL()) {
      expect(typeof message.subject).toBe('string');
      expect(message.subject.length).toBeGreaterThan(5);
      // A message with no text part scores worse with spam filters and is
      // unreadable in a text-only client.
      expect(typeof message.text).toBe('string');
      expect(message.text.length).toBeGreaterThan(20);
      expect(message.html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(message.html).toContain('</html>');
      expect(name).toBeTruthy();
    }
  });

  it('leaves no unresolved template holes', () => {
    for (const [name, message] of ALL()) {
      expect(`${name}:${message.html}`).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
      expect(`${name}:${message.text}`).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
    }
  });

  it('carries a preheader, so the inbox preview is not scraped body text', () => {
    for (const [, message] of ALL()) {
      expect(message.html).toMatch(/display:none;max-height:0/);
    }
  });

  it('uses inline styles only — Gmail strips style blocks and external sheets', () => {
    for (const [, message] of ALL()) {
      expect(message.html).not.toMatch(/<style[\s>]/i);
      expect(message.html).not.toMatch(/<link[\s>]/i);
      expect(message.html).not.toMatch(/src="https?:\/\//i);
    }
  });
});

describe('escaping', () => {
  it('will not let a display name break out of the markup', () => {
    // Names come from a signup form, so this is untrusted input rendered into
    // HTML that a mail client will execute the tags of.
    const message = templates.welcome({
      name: '<img src=x onerror=alert(1)>',
      role: 'customer',
      appUrl: ORDER.appUrl,
    });

    expect(message.html).not.toContain('<img src=x');
    expect(message.html).toContain('&lt;img src=x');
  });

  it('escapes a product title in an order confirmation', () => {
    const message = templates.orderPlaced({
      ...ORDER,
      items: [{ title: '</td><script>alert(1)</script>', quantity: 1, lineTotalLabel: '₹1.00' }],
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('keeps the rupee sign and inch marks intact rather than mangling them', () => {
    const message = templates.orderPlaced(ORDER);
    expect(message.html).toContain('₹2,40,656.20');
    // `"` in `15" M3` is escaped for the attribute-safe path, not dropped.
    expect(message.html).toContain('MacBook Air 15&quot; M3');
  });
});

describe('verification code email', () => {
  it('puts the code in the subject, so it is readable from a notification', () => {
    const message = templates.verificationCode({ code: '284917' });
    expect(message.subject).toContain('284917');
  });

  it('contains no links at all', () => {
    // A code the person types cannot be clicked by a scanner, and there is
    // nothing for a phishing lookalike to imitate.
    const message = templates.verificationCode({ code: '284917' });
    expect(message.html).not.toMatch(/<a\s/i);
  });

  it('states the expiry it was actually given', () => {
    const message = templates.verificationCode({ code: '111111', minutes: 10 });
    expect(message.text).toContain('10 minutes');
    expect(message.html).toContain('10 minutes');
  });

  it('works without a name, because sendOtp runs before any account exists', () => {
    const message = templates.verificationCode({ code: '222222' });
    expect(message.text.startsWith('Hi,')).toBe(true);
    expect(message.html).toContain('Hi,');
  });
});

describe('welcome email', () => {
  it('points a vendor at the dashboard and a customer at the catalogue', () => {
    const vendor = templates.welcome({ name: 'X', role: 'vendor', appUrl: ORDER.appUrl });
    const customer = templates.welcome({ name: 'X', role: 'customer', appUrl: ORDER.appUrl });

    expect(vendor.html).toContain(`${ORDER.appUrl}/vendor/dashboard`);
    expect(customer.html).toContain(`${ORDER.appUrl}/products`);
    expect(vendor.subject).not.toBe(customer.subject);
  });
});

describe('order confirmation', () => {
  it('lists every line and the total', () => {
    const message = templates.orderPlaced(ORDER);
    for (const item of ORDER.items) {
      expect(message.html).toContain(item.lineTotalLabel);
      expect(message.text).toContain(String(item.quantity));
    }
    expect(message.html).toContain(ORDER.totalLabel);
  });

  it('shortens the order id to something a person can read aloud', () => {
    const message = templates.orderPlaced(ORDER);
    expect(message.subject).toContain('08192A3B');
    expect(message.subject).not.toContain(ORDER.orderId);
  });

  it('renders without an address rather than printing "undefined"', () => {
    const message = templates.orderPlaced({ ...ORDER, address: null });
    expect(message.html).not.toContain('undefined');
    expect(message.html).not.toContain('Delivering to');
  });
});

describe('send() with no SMTP configured', () => {
  it('reports NOT_CONFIGURED instead of throwing', async () => {
    // This is the state of every fresh clone and every test run. If send()
    // threw here, signup would 500 on a machine with no mail credentials.
    const result = await send({ to: 'a@b.test', subject: 's', text: 't', html: '<p>t</p>' });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('NOT_CONFIGURED');
  });

  it('verifyMailer reports the same, without exiting the process', async () => {
    await expect(verifyMailer()).resolves.toEqual({ ok: false, reason: 'NOT_CONFIGURED' });
  });
});
