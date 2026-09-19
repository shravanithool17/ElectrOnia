// src/other/OtpForm.jsx — enter the emailed code, then create the account.
//
// THREE BUGS THIS FIXES
//
// 1. Both requests read `data.message` off a raw fetch. The API's error shape
//    is { error: { code, message } }, so `data.message` is always undefined —
//    every failure here showed as a BLANK error under the input. That is why
//    "the email never came" was so hard to pin down: the screen said nothing
//    at all. `api()` unwraps the real shape.
//
// 2. The vendor path posted to /verify-otp-vendor, which did not exist on the
//    API. Combined with (1), a vendor signup failed with an empty message.
//    The route is now mounted as an alias of /verify-otp.
//
// 3. The screen always said "check your email". When SMTP is not configured
//    the code is printed to the API console instead, and signup still works —
//    so the screen now says which of the two actually happened, using the
//    flag the server returns.
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { api } from '../lib/api';
import { setToken } from '../lib/auth';
import { useCart } from '../context/CartContext';

const OtpForm = () => {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { mergeGuestCart } = useCart();

  // Passed through from the signup page, which got it from the API.
  const emailed = location.state?.emailed !== false;
  const notice = location.state?.notice;
  const debug = location.state?.debug;

  const handleVerify = async (event) => {
    event?.preventDefault();

    const stored = JSON.parse(localStorage.getItem('signupData') || 'null');
    if (!stored) {
      setError('Signup details are missing. Please start again.');
      return;
    }

    const { email, name, password, address, phone, domain, role } = stored;
    const isVendor = role === 'vendor';

    setBusy(true);
    setError('');

    try {
      // 1. Verify the code.
      await api(isVendor ? '/verify-otp-vendor' : '/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp: otp.trim() }),
      });

      // 2. Create the account. The server refuses this unless the code above
      //    was verified, so the two calls cannot be reordered or skipped.
      const signupData = await api(isVendor ? '/signupvendor' : '/signupcustomer', {
        method: 'POST',
        body: JSON.stringify(
          isVendor
            ? { name, email, password, address, phone, domain }
            : { name, email, password, address, phone }
        ),
      });

      // 3. Store the token. setToken also tells the cart the browser's
      //    identity changed, so it stops showing the guest cart from memory.
      if (isVendor) {
        setToken(signupData.vendorToken, 'vendor');
      } else {
        setToken(signupData.token, 'customer');
        // 4. Bring anything added before signing up into the new account.
        //    Login always did this; signup did not, so the drawer kept the
        //    guest cart while checkout read the new, empty account cart and
        //    said "Your cart is empty". Never fatal — see mergeGuestCart.
        await mergeGuestCart();
      }

      localStorage.removeItem('signupData');
      navigate(isVendor ? '/vendor/dashboard' : '/');
    } catch (err) {
      setError(err.message || 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleVerify}
        className="bg-white p-8 rounded-lg border border-slate-200 w-full max-w-sm flex flex-col gap-4"
      >
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900">Confirm your email</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {emailed
              ? 'Enter the 6-digit code we emailed you. It expires in 5 minutes. Check spam if it is not in your inbox.'
              : 'Email is not configured on this server, so the code was printed to the terminal running the API. Copy it from there.'}
          </p>
        </div>

        {/* Shown when the server told us it did not actually send an email. */}
        {!emailed && notice && (
          <p className="text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {notice}
          </p>
        )}

        {/* Development only: show the code and target email to prevent being blocked by spam filters */}
        {import.meta.env.DEV && debug && (
          <div className="text-[11px] leading-relaxed bg-amber-50 border border-amber-300 text-amber-900 rounded-md p-3 space-y-1">
            <div className="font-semibold uppercase tracking-wider text-[10px] text-amber-700">Dev Only · Verification Helper</div>
            <p>Sent to: <span className="font-mono font-medium">{debug.to}</span></p>
            {debug.code && (
              <p>Code: <button type="button" onClick={() => setOtp(debug.code)} className="font-mono font-bold underline text-amber-950 hover:text-amber-800 ml-1">{debug.code} (click to fill)</button></p>
            )}
            <p className="text-[10px] text-amber-700">If not in your inbox, check Spam / Junk or Promotions.</p>
          </div>
        )}

        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={otp}
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
          className="w-full border border-slate-200 px-4 py-3 rounded font-mono text-lg tracking-[0.4em] text-center focus:outline-none focus:border-slate-900"
        />

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || otp.length < 4}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded text-sm hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? 'Verifying…' : 'Verify and create account'}
        </button>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Use a different email
        </button>
      </form>
    </div>
  );
};

export default OtpForm;
