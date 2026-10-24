import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { Logo } from '../AppShell.tsx';
import ColorModeToggle from '../ColorModeToggle.tsx';
import { cardClass } from '../ui.ts';
import { Reveal, usePanelColors } from '../effects.tsx';
import Aurora from '../reactbits/Aurora.tsx';

export const FullScreenLoader: React.FC = () => (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" role="status" aria-label="Cargando" />
    </div>
);

const AuthLayout: React.FC = () => {
    const { user, loading } = useAuth();
    const { mode, primary } = usePanelColors();

    if (loading) {
        return <FullScreenLoader />;
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
            {/* Decorative: brand-colored aurora along the top of the page */}
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]">
                <Aurora
                    colorStops={mode === 'dark' ? ['#1F3A2A', primary, '#2F5A3E'] : ['#CFE3D5', primary, '#9CC7AA']}
                    lightMode={mode === 'light'}
                    amplitude={0.8}
                    blend={0.6}
                    speed={0.6}
                    opacity={mode === 'dark' ? 0.7 : 0.45}
                />
            </div>
            <ColorModeToggle className="absolute right-4 top-4" />
            <Reveal distance={24} duration={0.6} className="w-full max-w-sm">
                <div className="mb-8 flex justify-center"><Logo /></div>
                <div className={`${cardClass} p-6 sm:p-8`}>
                    <Outlet />
                </div>
                <p className="mt-6 text-center text-xs text-fg-subtle">Tu carta digital con código QR.</p>
            </Reveal>
        </div>
    );
};

export default AuthLayout;
