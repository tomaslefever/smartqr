import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { FullScreenLoader } from './AuthLayout.tsx';
import LandingPage from '../LandingPage.tsx';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <FullScreenLoader />;
    }

    if (!user) {
        // Visitors who open the site's root get the landing page; any other private page asks them to sign in
        return location.pathname === '/' ? <LandingPage /> : <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default PrivateRoute;
