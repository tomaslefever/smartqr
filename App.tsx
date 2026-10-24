import React from 'react';
import HomePage from './components/HomePage.tsx';
import ProductsPage from './components/ProductsPage.tsx';
import CategoriesPage from './components/CategoriesPage.tsx';
import Store from './components/Store.tsx';
import StoreStylePage from './components/StoreStylePage.tsx';
import AppShell from './components/AppShell.tsx';
import Login from './components/auth/Login.tsx';
import Register from './components/auth/Register.tsx';
import AuthLayout from './components/auth/AuthLayout.tsx';
import PrivateRoute from './components/auth/PrivateRoute.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ColorModeProvider } from './context/ColorModeContext.tsx';
import { HashRouter, Routes, Route } from 'react-router-dom';

const App: React.FC = () => {
  return (
    <ColorModeProvider>
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>
            <Route path="/store/:userId" element={<Store />} />
            <Route
              element={
                <PrivateRoute>
                  <AppShell />
                </PrivateRoute>
              }
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/productos" element={<ProductsPage />} />
              <Route path="/categorias" element={<CategoriesPage />} />
              <Route path="/estilo" element={<StoreStylePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </HashRouter>
    </ColorModeProvider>
  );
};

export default App;
