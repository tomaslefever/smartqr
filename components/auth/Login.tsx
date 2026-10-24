import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { GoogleIcon } from '../Icons.tsx';
import { buttonClass, errorBoxClass, inputClass, labelClass } from '../ui.ts';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const { signInWithPassword, signInWithGoogle } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        const { error } = await signInWithPassword(email, password);
        setSubmitting(false);
        if (error) {
            setError(error.message);
        }
    };
    
    const handleGoogleSignIn = async () => {
        setError(null);
        setSubmitting(true);
        const { error } = await signInWithGoogle();
        if (error) {
            setError(error.message);
            setSubmitting(false);
        }
    };

    return (
        <div>
            <h2 className="text-xl font-semibold tracking-tight text-fg text-center">Iniciar sesión</h2>
            <p className="text-center text-sm text-fg-muted mt-1.5 mb-6">¡Bienvenido de nuevo!</p>
            
            {error && <p className={`${errorBoxClass} mb-4`}>{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className={labelClass}>Correo electrónico</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={`${inputClass} mt-1.5`}
                    />
                </div>
                <div>
                    <label htmlFor="password" className={labelClass}>Contraseña</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={`${inputClass} mt-1.5`}
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className={`${buttonClass('primary')} w-full`}
                >
                    {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
            </form>
            
            <div className="my-6 flex items-center">
                <div className="flex-grow border-t border-line"></div>
                <span className="flex-shrink mx-3 text-fg-subtle text-xs uppercase tracking-wider">o</span>
                <div className="flex-grow border-t border-line"></div>
            </div>

            <button
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className={`${buttonClass('secondary')} w-full`}
            >
                <GoogleIcon />
                <span>Iniciar sesión con Google</span>
            </button>

            <p className="mt-6 text-center text-sm text-fg-muted">
                ¿No tienes una cuenta? <Link to="/register" className="font-medium text-primary hover:underline">Regístrate</Link>
            </p>
        </div>
    );
};

export default Login;
