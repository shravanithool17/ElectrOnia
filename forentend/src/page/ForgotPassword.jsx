// src/page/ForgotPassword.jsx — reset a forgotten password with an emailed code.
//
// One page for both account types: /forgot-password for customers,
// /forgot-password?as=vendor for vendors. A customer and a vendor account can
// share an email, so the role goes to the API with every request.
//
//   step 1  email       → the API always answers the same way, whether or not
//                          the account exists, so we never say "no such account"
//   step 2  code + new  → on success the API signs you straight in
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { api } from '../lib/api';
import { setToken } from '../lib/auth';
import { useCart } from '../context/CartContext';

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 ' +
  'focus:border-transparent outline-none text-sm transition';
const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { mergeGuestCart } = useCart();

  const role = params.get('as') === 'vendor' ? 'vendor' : 'customer';
  const loginPath = role === 'vendor' ? '/loginvendor' : '/logincustomer';

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [notice, setNotice] = useState(null); // { tone, text }
  const [debug, setDebug] = useState(null); // development only: what the API actually did
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const cleanEmail = email.trim().toLowerCase();

  async function requestCode(e) {
    e?.preventDefault();
    setFieldErrors({});
    if (!EMAIL_RE.test(cleanEmail)) {
      setFieldErrors({ email: 'Enter a valid email address' });
      return;
    }

    setBusy(true);
    setNotice(null);
    setDebug(null);
    try {
      const res = await api('/api/v1/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, role }),
      });
      setNotice({ tone: res.emailed === false ? 'amber' : 'blue', text: res.message });
      setDebug(res.debug ?? null);
      // In development the API says when nothing was sent (no such account,
      // SMTP refused it). Stay on the email step then — there is no code to type.
      const nothingSent = res.debug && ['NO_ACCOUNT', 'SEND_FAILED'].includes(res.debug.outcome);
      if (nothingSent) {
        setNotice(null);
      } else {
        setStep('code');
        setCooldown(RESEND_SECONDS);
      }
    } catch (err) {
      setNotice({ tone: 'red', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    const errors = {};
    if (!/^\d{6}$/.test(code.trim())) errors.code = 'The code is 6 digits';
    if (password.length < 8) errors.password = 'At least 8 characters';
    if (confirm !== password) errors.confirm = "Passwords don't match";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await api('/api/v1/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, role, code: code.trim(), password }),
      });

      if (role === 'vendor') {
        setToken(res.vendorToken, 'vendor');
        navigate('/vendor/dashboard', { replace: true });
      } else {
        setToken(res.token, 'customer');
        // Same as a normal sign-in: fold in anything added while signed out.
        await mergeGuestCart();
        navigate('/', { replace: true });
      }
    } catch (err) {
      const fromServer = Object.fromEntries((err.details ?? []).map((d) => [d.field, d.message]));
      setFieldErrors(fromServer);
      setNotice({ tone: 'red', text: err.message });
      if (/new code/i.test(err.message)) setCode('');
    } finally {
      setBusy(false);
    }
  }

  const noticeTone = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-3 text-white font-bold text-xl">
            E
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {step === 'email' ? 'Forgot your password?' : 'Choose a new password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            {step === 'email'
              ? `Enter the email on your ${role === 'vendor' ? 'vendor ' : ''}account and we'll send you a 6-digit code.`
              : <>Enter the code sent to <span className="font-semibold text-slate-700">{cleanEmail}</span>.</>}
          </p>
        </div>

        {notice && (
          <div role={notice.tone === 'red' ? 'alert' : 'status'} className={`mb-5 p-3.5 rounded-xl border text-sm ${noticeTone[notice.tone]}`}>
            {notice.text}
          </div>
        )}

        {debug && (
          <div className={`mb-5 p-3.5 rounded-xl border text-sm ${debug.outcome === 'SENT' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Dev only · {debug.outcome.replace('_', ' ').toLowerCase()}</p>
            <p>{debug.detail}</p>
            {debug.otherRole && (
              <Link
                to={debug.otherRole === 'vendor' ? '/forgot-password?as=vendor' : '/forgot-password'}
                state={{ email: cleanEmail }}
                onClick={() => { setDebug(null); setNotice(null); setStep('email'); }}
                className="inline-block mt-2 font-semibold underline"
              >
                Reset the {debug.otherRole} password instead →
              </Link>
            )}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={requestCode} className="space-y-4" noValidate>
            <div>
              <label htmlFor="fp-email" className={labelClass}>Email</label>
              <input
                id="fp-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
              {fieldErrors.email && <p className="text-red-600 text-xs mt-1.5">{fieldErrors.email}</p>}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="space-y-4" noValidate>
            <div>
              <label htmlFor="fp-code" className={labelClass}>6-digit code</label>
              <input
                id="fp-code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} font-mono text-lg tracking-[0.4em] text-center`}
                placeholder="••••••"
              />
              {fieldErrors.code && <p className="text-red-600 text-xs mt-1.5">{fieldErrors.code}</p>}
            </div>

            <div>
              <label htmlFor="fp-password" className={labelClass}>New password</label>
              <div className="relative">
                <input
                  id="fp-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-14`}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold uppercase tracking-wider"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && <p className="text-red-600 text-xs mt-1.5">{fieldErrors.password}</p>}
            </div>

            <div>
              <label htmlFor="fp-confirm" className={labelClass}>Confirm new password</label>
              <input
                id="fp-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
              {fieldErrors.confirm && <p className="text-red-600 text-xs mt-1.5">{fieldErrors.confirm}</p>}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : 'Reset password & sign in'}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setStep('email'); setNotice(null); setCode(''); }}
                className="text-slate-500 hover:text-slate-800"
              >
                ← Different email
              </button>
              <button
                type="button"
                onClick={requestCode}
                disabled={busy || cooldown > 0}
                className="text-blue-600 font-semibold hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          {role === 'vendor' ? 'Shopping account? ' : 'Seller account? '}
          <Link
            to={role === 'vendor' ? '/forgot-password' : '/forgot-password?as=vendor'}
            state={{ email: cleanEmail }}
            onClick={() => { setDebug(null); setNotice(null); setStep('email'); }}
            className="text-blue-600 font-semibold hover:underline"
          >
            Reset that password instead
          </Link>
        </p>

        <p className="text-center text-sm text-slate-500 mt-3">
          Remembered it?{' '}
          <Link to={loginPath} className="text-blue-600 font-semibold hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
