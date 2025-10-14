import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { CloseIcon } from './Icons.tsx';

interface SettingsModalProps {
    user: User;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ user, onClose }) => {
    const [profile, setProfile] = useState<Partial<Profile>>({
        business_name: '',
        phone: '',
        address: '',
        opening_hours: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            const data = await supabaseService.getProfile();
            if (data) {
                setProfile({
                    business_name: data.business_name || '',
                    phone: data.phone || '',
                    address: data.address || '',
                    opening_hours: data.opening_hours || '',
                });
            }
            setLoading(false);
        };

        fetchProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        // The user ID will be added by the service based on the current session
        const profileDataToSave = {
            id: user.id,
            business_name: profile.business_name || null,
            phone: profile.phone || null,
            address: profile.address || null,
            opening_hours: profile.opening_hours || null,
        };
        await supabaseService.updateProfile(profileDataToSave);
        setSaving(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-full overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-brand-text">Configuración del Negocio</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                {loading ? (
                    <div className="p-8 text-center">Cargando configuración...</div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="p-6 space-y-4">
                            <div>
                                <label htmlFor="business_name" className="block text-sm font-medium text-gray-700">Nombre del Negocio</label>
                                <input type="text" name="business_name" id="business_name" value={profile.business_name ?? ''} onChange={handleChange} className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono</label>
                                <input type="tel" name="phone" id="phone" value={profile.phone ?? ''} onChange={handleChange} className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="address" className="block text-sm font-medium text-gray-700">Dirección (Opcional)</label>
                                <input type="text" name="address" id="address" value={profile.address ?? ''} onChange={handleChange} className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm" />
                            </div>
                             <div>
                                <label htmlFor="opening_hours" className="block text-sm font-medium text-gray-700">Horarios de Atención</label>
                                <textarea name="opening_hours" id="opening_hours" value={profile.opening_hours ?? ''} onChange={handleChange} rows={4} placeholder="Ej: Lunes a Viernes: 9am - 6pm" className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"></textarea>
                            </div>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email de Contacto</label>
                                <input type="email" name="email" id="email" value={user.email} disabled className="mt-1 block w-full bg-gray-100 border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-500 sm:text-sm" />
                                <p className="mt-1 text-xs text-gray-500">El email de contacto es el mismo que el de tu cuenta.</p>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-end space-x-4">
                            <button type="button" onClick={onClose} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary/50 transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" disabled={saving} className="bg-brand-primary text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors disabled:opacity-50">
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default SettingsModal;
