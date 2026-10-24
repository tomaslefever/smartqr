import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { Logo } from '../AppShell.tsx';
import ColorModeToggle from '../ColorModeToggle.tsx';
import { cardClass } from '../ui.ts';

export const FullScreenLoader: React.FC = () => (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" role="status" aria-label="Cargando" />
    </div>
);

const AuthLayout: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return <FullScreenLoader />;
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
            <ColorModeToggle className="absolute right-4 top-4" />
            <div className="w-full max-w-sm">
                <div className="mb-8 flex justify-center"><Logo /></div>
                <div className={`${cardClass} p-6 sm:p-8`}>
                    <Outlet />
                </div>
                <p className="mt-6 text-center text-xs text-fg-subtle">Tu carta digital con código QR.</p>
            </div>
        </div>
    );
};

export default AuthLayout;
