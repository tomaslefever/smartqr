import React from 'react';
import Dashboard from './components/Dashboard.tsx';
import Store from './components/Store.tsx';
import Login from './components/auth/Login.tsx';
import Register from './components/auth/Register.tsx';
import AuthLayout from './components/auth/AuthLayout.tsx';
import PrivateRoute from './components/auth/PrivateRoute.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { HashRouter, Routes, Route } from 'react-router-dom';

const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route path="/store/:userId" element={<Store />} />
          <Route 
            path="/" 
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } 
          />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;