import React from 'react';
import { Link } from 'react-router-dom';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { to: '/products?category=Laptops', label: 'Laptops & PCs' },
      { to: '/products?category=Smartphones', label: 'Smartphones' },
      { to: '/products?category=Audio', label: 'Audio & Headphones' },
      { to: '/products?category=Wearables', label: 'Smartwatches' },
      { to: '/products?category=Gaming', label: 'Gaming' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/contact', label: 'Contact us' },
      { to: '/orders', label: 'Track an order' },
      { to: '/wishlist', label: 'Your wishlist' },
      { to: '/about', label: 'About ElectrOnia' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { to: '/signupvendor', label: 'Become a vendor' },
      { to: '/loginvendor', label: 'Vendor sign in' },
      { to: '/vendor/dashboard', label: 'Vendor dashboard' },
    ],
  },
];

const Footer = () => (
  <footer className="bg-slate-50 text-slate-500 mt-24 text-[12px]">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
      <p className="pb-5 border-b border-slate-300/70 leading-relaxed">
        Prices include GST where shown. Every product is sold and shipped by an
        independent, verified seller; a multi-seller order ships as separate
        packages, each tracked on its own.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-6">
        <div className="col-span-2 md:col-span-1 flex flex-col gap-3">
          <Link to="/" className="inline-flex items-center gap-2 w-fit">
            <span className="w-6 h-6 rounded-md bg-brand text-white flex items-center justify-center text-[11px] font-bold">E</span>
            <span className="text-[14px] font-semibold text-slate-900 tracking-[-0.02em]">ElectrOnia</span>
          </Link>
          <p className="leading-relaxed max-w-xs">
            Laptops, phones, audio and gaming gear from independent sellers — one bag, one checkout.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title} className="flex flex-col gap-2.5">
            <h2 className="text-[12px] font-semibold text-slate-900 tracking-normal">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:text-slate-900 hover:underline underline-offset-2">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-300/70 mt-8 pt-5 flex flex-col sm:flex-row justify-between gap-3">
        <span>Copyright © {new Date().getFullYear()} ElectrOnia. All rights reserved.</span>
        <div className="flex gap-4">
          {[
            { to: '/about', label: 'Privacy' },
            { to: '/about', label: 'Terms' },
            { to: '/contact', label: 'Support' },
          ].map((link, i) => (
            <Link key={link.label} to={link.to} className={`hover:text-slate-900 ${i ? 'border-l border-slate-300 pl-4' : ''}`}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
