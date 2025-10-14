import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';

const AuthLayout: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-light">
                <p className="text-brand-primary text-lg">Cargando...</p>
            </div>
        );
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">
                <h1 className="text-3xl font-bold text-brand-primary text-center mb-6">Panel de SmartQR</h1>
                <div className="bg-white p-8 rounded-xl shadow-lg">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;