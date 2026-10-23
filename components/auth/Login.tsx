import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { GoogleIcon } from '../Icons.tsx';

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
            <h2 className="text-2xl font-bold text-brand-text text-center">Iniciar Sesión</h2>
            <p className="text-center text-gray-600 mt-2 mb-6">¡Bienvenido de nuevo!</p>
            
            {error && <p className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                    />
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-brand-primary text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors disabled:opacity-50"
                >
                    {submitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </button>
            </form>
            
            <div className="my-6 flex items-center">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink mx-4 text-gray-500 text-sm">O</span>
                <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <button
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="w-full flex justify-center items-center space-x-2 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary/50 transition-colors disabled:opacity-50"
            >
                <GoogleIcon />
                <span>Iniciar sesión con Google</span>
            </button>

            <p className="mt-6 text-center text-sm text-gray-600">
                ¿No tienes una cuenta? <Link to="/register" className="font-medium text-brand-primary hover:underline">Regístrate</Link>
            </p>
        </div>
    );
};

export default Login;
