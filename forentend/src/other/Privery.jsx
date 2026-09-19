// src/other/Privery.jsx — gate for pages that need a signed-in customer.
//
// Sends people to LOG IN, not sign up. The most common way to land here
// without a token is a session that expired or was dropped as invalid — a
// returning customer, who should not be shown a "Create account" form. The
// page they were on travels along, so they come back to it after.
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getToken } from '../lib/auth';

const Priversy = () => {
  const location = useLocation();

  if (getToken('customer')) return <Outlet />;

  return (
    <Navigate
      to="/logincustomer"
      replace
      state={{ from: location.pathname, reason: 'signin-required' }}
    />
  );
};

export default Priversy;
