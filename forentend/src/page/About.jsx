import React from 'react';
import { Link } from 'react-router-dom';

const About = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="text-center space-y-3 bg-white border border-slate-200 p-8 rounded-xl">
        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
          About ElectrOnia
        </span>
        <h1 className="text-3xl font-bold text-slate-900">Your Trusted Technology Marketplace</h1>
        <p className="text-slate-600 text-xs max-w-xl mx-auto leading-relaxed">
          ElectrOnia connects hardware creators and vendors directly with technology enthusiasts. We offer verified laptops, smartphones, and audio gear with full manufacturer support.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-1">
          <h3 className="text-slate-900 font-bold text-sm">Fast Shipping</h3>
          <p className="text-slate-500 text-xs">Direct API order processing and express warehouse dispatch.</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-1">
          <h3 className="text-slate-900 font-bold text-sm">Official Warranty</h3>
          <p className="text-slate-500 text-xs">All items are 100% brand authentic backed by standard warranties.</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-1">
          <h3 className="text-slate-900 font-bold text-sm">Verified Sellers</h3>
          <p className="text-slate-500 text-xs">Strict seller onboarding to guarantee quality standards.</p>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-8 rounded-xl text-center space-y-3">
        <h2 className="text-xl font-bold text-white">Sell on ElectrOnia</h2>
        <p className="text-slate-300 text-xs max-w-md mx-auto">
          Are you a certified electronics vendor or brand owner? Reach customers across the nation.
        </p>
        <Link to="/signupvendor" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg text-xs transition-colors">
          Become a Vendor →
        </Link>
      </div>
    </div>
  );
};

export default About;
