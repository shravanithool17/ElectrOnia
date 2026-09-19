import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from '../../lib/api';
import { setToken } from '../../lib/auth';

const VendorLogin = () => { 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");   
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate(); 

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      return setError("Email and password are required");
    }

    setIsSubmitting(true);

    try {
      const data = await api('/loginvendor', {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      setToken(data.vendorToken, 'vendor');
      navigate("/vendor/dashboard");
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 rounded-[28px]">
      <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-3 text-white font-bold text-xl shadow-md shadow-blue-500/30">
            E
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Vendor Login</h1>
          <p className="text-sm text-slate-500 mt-1.5">Sign in to manage your inventory and orders.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5">
            <span className="text-red-500 text-base leading-none">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Business Email
            </label>
            <input
              type="email"
              placeholder="vendor@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
              required
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Password
              </label>
              <Link
                to="/forgot-password?as=vendor"
                state={{ email: email.trim() }}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-14 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none text-xs font-semibold uppercase tracking-wider py-1 px-1 cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? "Signing in..." : "Login to Dashboard →"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          New to ElectrOnia?{" "}
          <Link to="/signupvendor" className="text-blue-600 font-semibold hover:underline">
            Register as a vendor
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VendorLogin;

                

