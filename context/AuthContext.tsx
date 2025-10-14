import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithPassword: (email: string, password: string) => Promise<{ error: any | null }>;
    signInWithGoogle: () => Promise<{ error: any | null }>;
    signUp: (email: string, password: string) => Promise<{ error: any | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            // The warning is already in supabaseClient.ts
            return;
        }

        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            setLoading(false);
        };
        
        getSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            (_event: AuthChangeEvent, session: Session | null) => {
                setUser(session?.user ?? null);
                // The redirect on sign-in is now handled by the AuthLayout component
                // to prevent redirecting logged-in users from public pages.
                if (_event === 'SIGNED_OUT') {
                    navigate('/login');
                }
            }
        );

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, [navigate]);

    const signInWithPassword = async (email: string, password: string) => {
        if (!supabase) return { error: { message: 'Supabase not initialized' } };
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        return { error };
    };
    
    const signInWithGoogle = async () => {
        if (!supabase) return { error: { message: 'Supabase not initialized' } };
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });
        setLoading(false);
        return { error };
    };

    const signUp = async (email: string, password: string) => {
        if (!supabase) return { error: { message: 'Supabase not initialized' } };
        setLoading(true);
        
        // First, attempt to create the user account.
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        
        if (signUpError) {
            setLoading(false);
            return { error: signUpError };
        }
    
        // If sign up was successful, immediately try to sign in.
        // This will create a session and log the user in if email confirmation is disabled.
        // The onAuthStateChange listener will handle the redirect.
        // If email confirmation is enabled, this will fail, and the error will be displayed
        // on the registration form, which is an improvement over the previous silent failure.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    
        setLoading(false);
        return { error: signInError };
    };

    const signOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    const value = {
        user,
        loading,
        signInWithPassword,
        signInWithGoogle,
        signUp,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
