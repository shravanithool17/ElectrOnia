import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from '../lib/api';

const CustomerProfile = () => {
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    
    if (!token) {
      navigate("/logincustomer");
      return;
    }

    const fetchCustomer = async () => {
      try {
        const res = await fetch(`${API_BASE}/profile`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Unauthorized");
        }

        setCustomer(data.customer);
      } catch (err) {
        console.error(err);
        setError("Failed to load profile. Please login again.");
        localStorage.removeItem("token");
        navigate("/");
      }
    };

    fetchCustomer();
  }, [navigate]);

  if (!customer) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500 text-lg">{error || "Loading..."}</p>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 p-8 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-2xl rounded-2xl border border-indigo-100">
      <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-8 text-center">Customer Profile</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-indigo-500">
          <label className="block text-indigo-700 font-bold text-sm uppercase tracking-wide mb-2">Name:</label>
          <p className="text-gray-800 text-lg font-medium">{customer.name}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-purple-500">
          <label className="block text-purple-700 font-bold text-sm uppercase tracking-wide mb-2">Email:</label>
          <p className="text-gray-800 text-lg font-medium">{customer.email}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500">
          <label className="block text-blue-700 font-bold text-sm uppercase tracking-wide mb-2">Phone:</label>
          <p className="text-gray-800 text-lg font-medium">{customer.phone || "Not Provided"}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-teal-500">
          <label className="block text-teal-700 font-bold text-sm uppercase tracking-wide mb-2">Address:</label>
          <p className="text-gray-800 text-lg font-medium">{customer.address || "Not Provided"}</p>
        </div>
      </div>

      <div className="flex justify-center mt-10">
        <button
          onClick={handleLogout}
          className="px-8 py-4 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold text-lg rounded-full shadow-xl transform hover:scale-105 transition-all duration-300 ease-in-out"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default CustomerProfile;