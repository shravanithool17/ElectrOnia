import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import Nav from './Nav';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';

import Home from './page/Home';
import Products from './page/Products';
import ProductDetails from './page/ProductDetails';
import Checkout from './page/Checkout';
import Orders from './page/Orders';
import About from './page/About';
import Contact from './page/Contact';
import Wishlist from './page/Wishlist';
import ErrorBoundary from './components/ErrorBoundary';
import AnnouncementBar from './components/AnnouncementBar';

import CustomerProfile from './other/Profile';
import Login from './page/customer/login';
import Signup from './page/customer/signup';
import OtpForm from './other/OtpForm';

import VendorLogin from './page/vendor/Login';
import SignupVendor from './page/vendor/signup';
import VendorOtpForm from './other/Otppage';
import VendorDashboard from './page/vendor/VendorDashboard';

import ForgotPassword from './page/ForgotPassword';
import Priversy from './other/Privery';
import './App.css';

function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between">
          
          <AnnouncementBar />
          <Nav />
          <CartDrawer />

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
            <ErrorBoundary>
            <Routes>
              {/* Public Pages */}
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetails />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/wishlist" element={<Wishlist />} />

              {/* Customer Protected Pages */}
              <Route element={<Priversy />}>
                <Route path="/profile" element={<CustomerProfile />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/orders" element={<Orders />} />
              </Route>

              {/* Customer Auth */}
              <Route path="/logincustomer" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signupcustomer" element={<Signup />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/verify-otp" element={<OtpForm />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Vendor Auth & Portal */}
              <Route path="/loginvendor" element={<VendorLogin />} />
              <Route path="/vendor-login" element={<VendorLogin />} />
              <Route path="/signupvendor" element={<SignupVendor />} />
              <Route path="/vendor-signup" element={<SignupVendor />} />
              <Route path="/vendorotp" element={<VendorOtpForm />} />
              <Route path="/vendor/dashboard" element={<VendorDashboard />} />
            </Routes>
            </ErrorBoundary>
          </main>

          <Footer />

        </div>
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;
