import React, { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons.tsx';
import { iconButtonClass } from './ui.ts';
import AnimatedContent from './reactbits/AnimatedContent.tsx';
import FadeContent from './reactbits/FadeContent.tsx';

interface ModalProps {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
    // Tailwind max-width class
    size?: string;
}

// Dialog shell for the panel: blurred backdrop, Escape and backdrop click close it.
// Rendered in <body> so the page's animated (transformed) wrappers cannot trap or offset it.
const Modal: React.FC<ModalProps> = ({ title, description, onClose, children, size = 'max-w-lg' }) => {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <FadeContent trigger="mount" duration={0.2} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <AnimatedContent
                trigger="mount"
                distance={24}
                scale={0.97}
                duration={0.35}
                className={`relative flex max-h-[92vh] w-full ${size} flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl`}
            >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                    <div>
                        <h2 id="modal-title" className="text-base font-semibold text-fg">{title}</h2>
                        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className={`${iconButtonClass} -mr-2`} aria-label="Cerrar">
                        <CloseIcon />
                    </button>
                </div>
                {children}
            </AnimatedContent>
        </div>,
        document.body,
    );
};

export const modalBodyClass = 'flex-1 overflow-y-auto px-6 py-5';
export const modalFooterClass = 'flex justify-end gap-2 border-t border-line bg-muted/40 px-6 py-4';

export default Modal;
