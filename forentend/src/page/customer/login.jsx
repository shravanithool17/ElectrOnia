import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from '../../lib/api';
import { useCart } from '../../context/CartContext';
import { setToken } from '../../lib/auth';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mergeGuestCart } = useCart();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email address";
    }

    if (!password.trim()) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Minimum 6 characters required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setServerError("");

    try {
      // api() carries credentials, so the guest cart cookie travels with this
      // request and unwraps the API's { error: { message } } shape for us.
      const data = await api('/logincustomer', {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      // Through setToken, not localStorage directly, so the cart hears about it.
      setToken(data.token, 'customer');

      // Fold anything added before signing in into this account's cart. The
      // guest token is in an httpOnly cookie, so the server reads it there.
      // A failure here is deliberately not fatal — it must never block login.
      await mergeGuestCart();

      // Back to wherever the sign-in wall stopped them (usually checkout).
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      setServerError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 rounded-[28px] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600 text-lg">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 text-sm font-semibold mb-2 ml-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-4 rounded-2xl border-2 border-gray-200 bg-white/70 backdrop-blur-sm
                         text-gray-800 placeholder-gray-500 text-lg font-medium
                         focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/50
                         hover:border-gray-300 hover:shadow-lg transition-all duration-300"
              placeholder="Enter your email"
            />
            {errors.email && <p className="text-red-500 text-sm mt-2 ml-2 font-medium">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-semibold mb-2 ml-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-4 pr-16 rounded-2xl border-2 border-gray-200 bg-white/70 backdrop-blur-sm
                           text-gray-800 placeholder-gray-500 text-lg font-medium
                           focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/50
                           hover:border-gray-300 hover:shadow-lg transition-all duration-300"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-600 focus:outline-none text-xs font-semibold uppercase tracking-wider py-1 px-1.5 cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-sm mt-2 ml-2 font-medium">{errors.password}</p>}
          </div>

          {serverError && <p className="text-red-600 text-sm text-center font-semibold animate-pulse">{serverError}</p>}

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-600">Remember me</span>
            </label>
            <Link
              to="/forgot-password"
              state={{ email: email.trim() }}
              className="text-blue-600 hover:text-blue-800 font-medium transition duration-200"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-2xl text-white text-lg font-bold text-center
                        bg-gradient-to-r from-blue-600 to-indigo-600
                        hover:from-blue-700 hover:to-indigo-700
                        focus:outline-none focus:ring-4 focus:ring-blue-300
                        transition-all duration-200 shadow-xl hover:shadow-2xl
                        transform ${isSubmitting ? "opacity-60 cursor-not-allowed" : "hover:scale-105 active:scale-95"}`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mr-3"></div>
                Logging In...
              </div>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Don't have an account?{" "}
            <span
              className="text-blue-600 font-semibold hover:text-blue-800 cursor-pointer transition"
              onClick={() => navigate("/signup")}
            >
              Sign Up
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
