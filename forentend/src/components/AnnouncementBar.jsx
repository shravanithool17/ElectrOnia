import React from 'react';

// A thin gradient strip above the navigation with a slow marquee. Every line
// here is true of the store today — keep it that way when editing.
const ITEMS = [
  'Free shipping on orders over ₹5,000',
  'Every seller verified before listing',
  'Pay online or cash on delivery',
  'Multi-seller orders tracked package by package',
];

export default function AnnouncementBar() {
  // Rendered twice back to back so the loop is seamless.
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="bg-brand text-white text-[12px] font-medium overflow-hidden" role="region" aria-label="Store announcements">
      <p className="sr-only">{ITEMS.join('. ')}</p>
      <div className="marquee py-2" aria-hidden="true">
        {[...row, ...row].map((text, i) => (
          <span key={i} className="flex items-center gap-8 px-8 whitespace-nowrap">
            {text}
            <span className="opacity-60">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
