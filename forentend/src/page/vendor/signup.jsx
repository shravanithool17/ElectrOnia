import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from '../../lib/api';

const DOMAIN_SUGGESTIONS = [
  "Consumer Electronics",
  "Audio & Headphones",
  "Smartphones & Tablets",
  "Computers & Laptops",
  "Smart Home & IoT",
  "Gaming & Accessories",
  "Wearables & Smartwatches",
];

const VendorSignup = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    address: "",
    phone: "",
    domain: "",
  });

  const navigate = useNavigate();
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (errors[e.target.name]) {
      setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
    }
  };

  const validate = () => {
    const errs = {};
    const { name, email, password, confirmPassword, address, phone, domain } = form;

    if (!name.trim() || name.trim().length < 2) {
      errs.name = "Business / Vendor name must be at least 2 characters";
    }

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errs.email = "Enter a valid business email address";
    }

    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    if (!address.trim() || address.trim().length < 5) {
      errs.address = "Business / Store address must be at least 5 characters";
    }

    if (!phone.trim() || phone.trim().length < 6) {
      errs.phone = "Enter a valid contact phone number (at least 6 digits)";
    }

    if (!domain.trim() || domain.trim().length < 2) {
      errs.domain = "Please specify your business category / domain";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const otpData = await api('/sendvendorotp', {
        method: "POST",
        body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
      });

      // Crucial: role: 'vendor' ensures /verify-otp calls /signupvendor instead of customer signup
      localStorage.setItem("signupData", JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        address: form.address.trim(),
        phone: form.phone.trim(),
        domain: form.domain.trim(),
        role: 'vendor',
      }));

      navigate("/verify-otp", {
        state: { emailed: otpData?.emailed !== false, notice: otpData?.message, debug: otpData?.debug },
      });
    } catch (err) {
      setErrors({ submit: err.message || "Failed to send verification code." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 rounded-[28px]">
      <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-3 text-white font-bold text-xl shadow-md shadow-blue-500/30">
            E
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Become an ElectrOnia Vendor
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            List your electronics catalogue, receive orders, and track your revenue.
          </p>
        </div>

        {errors.submit && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5">
            <span className="text-red-500 text-base leading-none">⚠️</span>
            <span>{errors.submit}</span>
          </div>
        )}

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Store / Business Name
            </label>
            <input
              name="name"
              type="text"
              placeholder="e.g. Apex Tech Solutions"
              value={form.name}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
              required
            />
            {errors.name && <p className="text-xs text-red-500 mt-1 font-medium">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Business Email
            </label>
            <input
              name="email"
              type="email"
              placeholder="vendor@company.com"
              value={form.email}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
              required
            />
            {errors.email && <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Password
              </label>
              <input
                name="password"
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                required
              />
              {errors.password && <p className="text-xs text-red-500 mt-1 font-medium">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Confirm Password
              </label>
              <input
                name="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                value={form.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                required
              />
              {errors.confirmPassword && <p className="text-xs text-red-500 mt-1 font-medium">{errors.confirmPassword}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Phone Number
              </label>
              <input
                name="phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                required
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1 font-medium">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Product Category / Domain
              </label>
              <input
                name="domain"
                type="text"
                list="domain-options"
                placeholder="e.g. Audio, Laptops"
                value={form.domain}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                required
              />
              <datalist id="domain-options">
                {DOMAIN_SUGGESTIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              {errors.domain && <p className="text-xs text-red-500 mt-1 font-medium">{errors.domain}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Store / Warehouse Address
            </label>
            <input
              name="address"
              type="text"
              placeholder="e.g. 102 Industrial Area, Sector 5, Mumbai"
              value={form.address}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
              required
            />
            {errors.address && <p className="text-xs text-red-500 mt-1 font-medium">{errors.address}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? "Sending verification code..." : "Send Verification OTP →"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already a registered vendor?{" "}
          <Link to="/loginvendor" className="text-blue-600 font-semibold hover:underline">
            Sign in to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VendorSignup;
