import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminSignup from './page/adminsignup'; // Make sure path is correct

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signupadmin" element={<AdminSignup />} />
        {/* Add other routes here */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
