import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import SettingsModal from './SettingsModal.tsx';
import StoreQRModal from './StoreQRModal.tsx';
import ColorModeToggle from './ColorModeToggle.tsx';
import { CloseIcon, ColorSwatchIcon, ExternalLinkIcon, HomeIcon, LogoutIcon, MenuIcon, QrCodeIcon, QrMarkIcon, SettingsIcon, TagIcon, ViewGridIcon } from './Icons.tsx';
import { iconButtonClass } from './ui.ts';

const navItemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'bg-muted text-fg' : 'text-fg-muted hover:bg-muted/60 hover:text-fg'}`;

export const Logo: React.FC = () => (
    <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <QrMarkIcon />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-fg">SmartQR</span>
    </div>
);

const SidebarContent: React.FC<{ onOpenSettings: () => void; onOpenQR: () => void }> = ({ onOpenSettings, onOpenQR }) => {
    const { user, signOut } = useAuth();
    const initial = (user?.email ?? '?').charAt(0).toUpperCase();

    return (
        <div className="flex h-full flex-col">
            <div className="px-5 pt-5 pb-6"><Logo /></div>

            <nav className="flex-1 space-y-1 px-3" aria-label="Principal">
                <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
                    <HomeIcon />
                    Inicio
                </NavLink>
                <NavLink to="/productos" className={({ isActive }) => navItemClass(isActive)}>
                    <ViewGridIcon />
                    Productos
                </NavLink>
                <NavLink to="/categorias" className={({ isActive }) => navItemClass(isActive)}>
                    <TagIcon />
                    Categorías
                </NavLink>
                <NavLink to="/estilo" className={({ isActive }) => navItemClass(isActive)}>
                    <ColorSwatchIcon />
                    Estilo de la carta
                </NavLink>
                <button type="button" onClick={onOpenQR} className={navItemClass(false)}>
                    <QrCodeIcon />
                    Código QR
                </button>
                <button type="button" onClick={onOpenSettings} className={navItemClass(false)}>
                    <SettingsIcon />
                    Configuración
                </button>
                <a href={`#/store/${user?.id}`} target="_blank" rel="noopener noreferrer" className={navItemClass(false)}>
                    <ExternalLinkIcon />
                    Ver tienda
                </a>
            </nav>

            <div className="space-y-4 border-t border-line p-4">
                <ColorModeToggle className="w-full" />
                <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-muted">{initial}</span>
                    <p className="min-w-0 flex-1 truncate text-sm text-fg-muted" title={user?.email}>{user?.email}</p>
                    <button type="button" onClick={signOut} className={iconButtonClass} title="Cerrar sesión" aria-label="Cerrar sesión">
                        <LogoutIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

// Actions of the shell that pages can trigger (e.g. the home page's shortcuts)
interface ShellContext {
    openQR: () => void;
    openSettings: () => void;
}

export const useShell = () => useOutletContext<ShellContext>();

// Layout of the private pages: fixed sidebar on desktop, slide-over menu on mobile
const AppShell: React.FC = () => {
    const { user } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const location = useLocation();

    useEffect(() => setMobileOpen(false), [location.pathname]);

    const openSettings = () => {
        setMobileOpen(false);
        setSettingsOpen(true);
    };

    const openQR = () => {
        setMobileOpen(false);
        setQrOpen(true);
    };

    return (
        <div className="min-h-screen bg-canvas text-fg">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
                <SidebarContent onOpenSettings={openSettings} onOpenQR={openQR} />
            </aside>

            <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur lg:hidden">
                <Logo />
                <button type="button" onClick={() => setMobileOpen(true)} className={iconButtonClass} aria-label="Abrir menú">
                    <MenuIcon />
                </button>
            </header>

            {mobileOpen && (
                <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-line bg-surface shadow-pop">
                        <button type="button" onClick={() => setMobileOpen(false)} className={`${iconButtonClass} absolute right-3 top-4`} aria-label="Cerrar menú">
                            <CloseIcon />
                        </button>
                        <SidebarContent onOpenSettings={openSettings} onOpenQR={openQR} />
                    </aside>
                </div>
            )}

            <main className="lg:pl-64">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
                    <Outlet context={{ openQR, openSettings } satisfies ShellContext} />
                </div>
            </main>

            {settingsOpen && user && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} />}
            {qrOpen && <StoreQRModal onClose={() => setQrOpen(false)} />}
        </div>
    );
};

// Title row shared by the panel's pages
export const PageHeader: React.FC<{ title: string; description?: string; actions?: React.ReactNode }> = ({ title, description, actions }) => (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

export default AppShell;
