// lib/coupons.data.js — the launch coupons.
//
// Values are integer paise, except `value` on a percent coupon which is a
// percentage. Every percentage coupon has a maxDiscount: without a cap, one
// large order can cost more than the whole campaign was worth.
export const COUPONS = [
  {
    code: 'WELCOME10',
    description: '10% off your first order, up to ₹2,000',
    type: 'percent',
    value: 10,
    maxDiscount: 200000,
    minOrderValue: 100000, // ₹1,000
    usageLimitPerUser: 1,
    usageLimitTotal: null,
  },
  {
    code: 'SUMMER20',
    description: '20% off orders over ₹10,000, up to ₹5,000',
    type: 'percent',
    value: 20,
    maxDiscount: 500000,
    minOrderValue: 1000000, // ₹10,000
    usageLimitPerUser: 2,
    usageLimitTotal: 500,
  },
  {
    code: 'STUDENT15',
    description: '15% student discount, up to ₹3,000',
    type: 'percent',
    value: 15,
    maxDiscount: 300000,
    minOrderValue: 200000, // ₹2,000
    usageLimitPerUser: 1,
    usageLimitTotal: null,
  },
  {
    code: 'FREESHIP',
    description: 'Free delivery on any order',
    type: 'free_shipping',
    value: 0,
    minOrderValue: 0,
    usageLimitPerUser: 5,
    usageLimitTotal: null,
  },
  {
    code: 'FLAT500',
    description: '₹500 off orders over ₹5,000',
    type: 'fixed',
    value: 50000, // ₹500 in paise
    minOrderValue: 500000,
    usageLimitPerUser: 1,
    usageLimitTotal: 1000,
  },
];
