import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from '../../lib/api';

const Signup = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    address: "",
    phone: "",
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateForm = () => {
    const { name, email, password, confirmPassword, address, phone } = formData;
    const newErrors = {};

    if (!name.trim()) newErrors.name = "Name is required";
    if (!email.trim()) newErrors.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(email)) newErrors.email = "Invalid email";

    if (!password) newErrors.password = "Password is required";
    else if (password.length < 6) newErrors.password = "Min 6 characters";

    if (!confirmPassword) newErrors.confirmPassword = "Confirm password";
    else if (password !== confirmPassword) newErrors.confirmPassword = "Passwords don't match";

    if (!address.trim()) newErrors.address = "Address is required";
    if (!phone.trim()) newErrors.phone = "Phone number is required";
    else if (!/^\d{10}$/.test(phone)) newErrors.phone = "Invalid phone number";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // api() unwraps the API's { error: { message } } shape. Raw fetch read
      // otpData.message, which is never there, so a real reason ("Email
      // delivery is not configured on this server") arrived as the generic
      // "Failed to send OTP".
      const otpData = await api('/send-otp', {
        method: "POST",
        body: JSON.stringify({ email: formData.email }),
      });

      localStorage.setItem("signupData", JSON.stringify(formData));
      // The server says whether it actually emailed the code or only printed
      // it to the API console. Passing that through means the next screen can
      // tell the truth instead of saying "check your inbox" either way.
      navigate("/verify-otp", {
        state: { emailed: otpData?.emailed !== false, notice: otpData?.message, debug: otpData?.debug },
      });
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 rounded-[28px]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-6"
      >
        <h2 className="text-3xl font-bold text-center text-indigo-600">Create Account</h2>

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}

        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}

        <input
          type="text"
          name="address"
          placeholder="Address"
          value={formData.address}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.address && <p className="text-red-500 text-sm">{errors.address}</p>}

        <input
          type="text"
          name="phone"
          placeholder="Phone Number"
          value={formData.phone}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.phone && <p className="text-red-500 text-sm">{errors.phone}</p>}

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.password && <p className="text-red-500 text-sm">{errors.password}</p>}

        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChange={handleChange}
          className="w-full px-4 py-3 rounded-xl border border-gray-300"
        />
        {errors.confirmPassword && <p className="text-red-500 text-sm">{errors.confirmPassword}</p>}

        {errors.submit && <p className="text-red-600 font-medium">{errors.submit}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition"
        >
          {isSubmitting ? "Sending OTP..." : "Sign Up"}
        </button>

        <p className="text-center text-gray-600 mt-4">
          Already have an account?{" "}
          <span className="text-indigo-500 cursor-pointer" onClick={() => navigate("/login")}>
            Login
          </span>
        </p>
      </form>
    </div>
  );
};

export default Signup;
