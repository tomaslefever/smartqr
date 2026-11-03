import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import Switch from './Switch.tsx';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from './storeOrder.ts';
import { buttonClass, errorBoxClass, hintClass, inputClass, labelClass, textareaClass } from './ui.ts';

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
    const [error, setError] = useState<string | null>(null);
    // WhatsApp orders; their columns exist only after supabase/whatsapp-orders.sql
    const [ordersSupported, setOrdersSupported] = useState(false);
    const [ordersEnabled, setOrdersEnabled] = useState(false);
    const [ordersWhatsapp, setOrdersWhatsapp] = useState('');
    const [ordersDelivery, setOrdersDelivery] = useState(false);

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
                setOrdersSupported('orders_enabled' in data);
                setOrdersEnabled(data.orders_enabled === true);
                setOrdersWhatsapp(data.orders_whatsapp || '');
                setOrdersDelivery(data.orders_delivery === true);
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
        const whatsapp = normalizeWhatsAppNumber(ordersWhatsapp);
        if (ordersSupported && ordersEnabled && !isValidWhatsAppNumber(whatsapp)) {
            setError('Escribe el número de WhatsApp para pedidos con código de país, por ejemplo 56912345678.');
            return;
        }
        setError(null);
        setSaving(true);
        // The user ID will be added by the service based on the current session
        const profileDataToSave = {
            id: user.id,
            business_name: profile.business_name || null,
            phone: profile.phone || null,
            address: profile.address || null,
            opening_hours: profile.opening_hours || null,
            // Sent only when the columns exist, so the rest still saves before the migration
            ...(ordersSupported ? {
                orders_enabled: ordersEnabled,
                orders_whatsapp: isValidWhatsAppNumber(whatsapp) ? whatsapp : null,
                orders_delivery: ordersDelivery,
            } : {}),
        };
        const saved = await supabaseService.updateProfile(profileDataToSave);
        setSaving(false);
        if (!saved) {
            setError('No se pudieron guardar los cambios. Inténtalo de nuevo.');
            return;
        }
        onClose();
    };

    return (
        <Modal title="Configuración del negocio" description="Estos datos aparecen en tu carta pública." onClose={onClose}>
            {loading ? (
                <div className="space-y-4 px-6 py-6">
                    {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className={`${modalBodyClass} space-y-4`}>
                        <div>
                            <label htmlFor="business_name" className={labelClass}>Nombre del negocio</label>
                            <input type="text" name="business_name" id="business_name" value={profile.business_name ?? ''} onChange={handleChange} className={`${inputClass} mt-1.5`} />
                        </div>
                        <div>
                            <label htmlFor="phone" className={labelClass}>Teléfono</label>
                            <input type="tel" name="phone" id="phone" value={profile.phone ?? ''} onChange={handleChange} className={`${inputClass} mt-1.5`} />
                        </div>
                        <div>
                            <label htmlFor="address" className={labelClass}>Dirección <span className="font-normal text-fg-subtle">(opcional)</span></label>
                            <input type="text" name="address" id="address" value={profile.address ?? ''} onChange={handleChange} className={`${inputClass} mt-1.5`} />
                        </div>
                        <div>
                            <label htmlFor="opening_hours" className={labelClass}>Horarios de atención</label>
                            <textarea name="opening_hours" id="opening_hours" value={profile.opening_hours ?? ''} onChange={handleChange} rows={3} placeholder="Ej: Lunes a Viernes: 9:00 - 18:00" className={`${textareaClass} mt-1.5`}></textarea>
                        </div>
                        <div>
                            <label htmlFor="email" className={labelClass}>Email de la cuenta</label>
                            <input type="email" name="email" id="email" value={user.email} disabled className={`${inputClass} mt-1.5 bg-muted text-fg-muted`} />
                            <p className={`${hintClass} mt-1.5`}>Es el email con el que inicias sesión. No se muestra en la tienda.</p>
                        </div>

                        <div className="space-y-4 border-t border-line pt-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label htmlFor="orders_enabled" className={labelClass}>Pedidos por WhatsApp</label>
                                    <p className={`${hintClass} mt-0.5`}>Tus clientes arman su pedido en la carta y te llega por WhatsApp, listo para confirmar.</p>
                                </div>
                                <Switch id="orders_enabled" checked={ordersEnabled} onChange={setOrdersEnabled} disabled={!ordersSupported} />
                            </div>
                            {!ordersSupported && (
                                <p className={hintClass}>Para activarlos hay que ejecutar la migración supabase/whatsapp-orders.sql.</p>
                            )}
                            {ordersSupported && ordersEnabled && (
                                <>
                                    <div>
                                        <label htmlFor="orders_whatsapp" className={labelClass}>Número de WhatsApp para pedidos</label>
                                        <input type="tel" id="orders_whatsapp" value={ordersWhatsapp} onChange={(e) => setOrdersWhatsapp(e.target.value)} placeholder="56912345678" className={`${inputClass} mt-1.5`} />
                                        <p className={`${hintClass} mt-1.5`}>Con código de país. Es el número al que te escriben los clientes; puede ser distinto al teléfono de arriba.</p>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <label htmlFor="orders_delivery" className={labelClass}>Hago despachos a domicilio</label>
                                            <p className={`${hintClass} mt-0.5`}>Si no, los pedidos son para retiro en el local. Los que llegan desde el QR de una mesa indican la mesa.</p>
                                        </div>
                                        <Switch id="orders_delivery" checked={ordersDelivery} onChange={setOrdersDelivery} />
                                    </div>
                                </>
                            )}
                        </div>

                        {error && <p className={errorBoxClass}>{error}</p>}
                    </div>
                    <div className={modalFooterClass}>
                        <button type="button" onClick={onClose} className={buttonClass('secondary')}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving} className={buttonClass('primary')}>
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default SettingsModal;
