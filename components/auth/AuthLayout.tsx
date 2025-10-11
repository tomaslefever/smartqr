import React from 'react';
import { Outlet } from 'react-router-dom';

const AuthLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">
                <h1 className="text-3xl font-bold text-brand-primary text-center mb-6">Panel del Mercado Local</h1>
                <div className="bg-white p-8 rounded-xl shadow-lg">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
