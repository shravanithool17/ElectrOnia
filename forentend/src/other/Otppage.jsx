import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from '../lib/api';
const VendorOtpVerify = () => {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  // const navigate = useNavigate(); // Router navigation would be handled externally
const navigate=useNavigate();
  const handleVerify = async (e) => {
    e.preventDefault();
    const signupData = JSON.parse(localStorage.getItem("signupData"));
    if (!signupData) {
      return setError("No signup data found. Please start over.");
    }

    try {
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupData.email, otp }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      // Call actual vendor signup
      const signupRes = await fetch(`${API_BASE}/signupvendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signupData),
      });

      const signupResult = await signupRes.json();
      if (!signupRes.ok) throw new Error(signupResult.message);

      localStorage.removeItem("signupData");
      alert("Signup successful!");
      navigate("/"); // Navigation would be handled externally
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Verify OTP</h2>
          <p className="text-gray-600">Enter the verification code sent to your email</p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all duration-200 placeholder-gray-400 text-center text-2xl font-mono tracking-widest"
              maxLength="6"
              required
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              Please check your email for the verification code
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <svg className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={!otp.trim()}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 focus:ring-4 focus:ring-indigo-200 transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            Verify & Complete Signup
          </button>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Didn't receive the code?
            <button className="text-indigo-600 hover:text-indigo-700 font-medium ml-1">
              Resend OTP
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VendorOtpVerify;