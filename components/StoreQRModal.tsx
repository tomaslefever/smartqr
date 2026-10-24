import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import QRCodeComponent, { QR_OPTIONS } from './QRCode.tsx';
import { CheckIcon, CopyIcon, DownloadIcon, PrinterIcon } from './Icons.tsx';
import { buttonClass, iconButtonClass } from './ui.ts';

export const getStoreUrl = (userId: string | undefined) =>
    `${window.location.origin}${window.location.pathname}#/store/${userId}`;

// margin 4 keeps the standard quiet zone so the printed code scans reliably
const toPrintableDataUrl = (url: string) => QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024, margin: 4 });

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Prints a page with the business name and the QR from a hidden iframe, so the panel itself is not printed
const printQR = (dataUrl: string, businessName: string) => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Código QR</title><style>
        @page { margin: 20mm; }
        body { margin: 0; font-family: system-ui, sans-serif; text-align: center; color: #18181b; }
        h1 { margin: 0 0 8mm; font-size: 28pt; }
        img { width: 120mm; height: 120mm; }
        p { margin: 6mm 0 0; font-size: 14pt; color: #52525b; }
    </style></head><body>
        ${businessName ? `<h1>${escapeHtml(businessName)}</h1>` : ''}
        <img src="${dataUrl}" alt="">
        <p>Escanea el código para ver la carta</p>
    </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) return;
        win.addEventListener('afterprint', () => iframe.remove());
        win.focus();
        win.print();
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
};

const StoreQRModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const [businessName, setBusinessName] = useState('');
    const [copied, setCopied] = useState(false);
    const storeUrl = getStoreUrl(user?.id);

    useEffect(() => {
        supabaseService.getProfile().then(profile => setBusinessName(profile?.business_name ?? ''));
    }, []);

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(storeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying store URL:', error);
        }
    };

    const handleDownload = async () => {
        try {
            const link = document.createElement('a');
            link.href = await toPrintableDataUrl(storeUrl);
            link.download = 'smartqr-tienda.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error generating QR code for download:', error);
        }
    };

    const handlePrint = async () => {
        try {
            printQR(await toPrintableDataUrl(storeUrl), businessName);
        } catch (error) {
            console.error('Error generating QR code for printing:', error);
        }
    };

    return (
        <Modal title="Código QR de la tienda" description="Escanéalo para abrir tu carta pública." onClose={onClose} size="max-w-sm">
            <div className={modalBodyClass}>
                <div className="flex justify-center">
                    <div className="rounded-xl border border-line bg-white p-3">
                        <QRCodeComponent url={storeUrl} size={220} />
                    </div>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-muted/50 py-1 pl-3 pr-1">
                    <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-fg-muted hover:text-fg" title={storeUrl}>
                        {storeUrl.replace(/^https?:\/\//, '')}
                    </a>
                    <button type="button" onClick={handleCopyUrl} className={iconButtonClass} title={copied ? 'Copiado' : 'Copiar enlace'} aria-label="Copiar enlace">
                        {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                    </button>
                </div>
            </div>
            <div className={modalFooterClass}>
                <button type="button" onClick={handleDownload} className={buttonClass('secondary')}>
                    <DownloadIcon />
                    Descargar PNG
                </button>
                <button type="button" onClick={handlePrint} className={buttonClass('primary')}>
                    <PrinterIcon />
                    Imprimir
                </button>
            </div>
        </Modal>
    );
};

export default StoreQRModal;
