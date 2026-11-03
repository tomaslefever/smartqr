import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import QRCodeComponent, { QR_OPTIONS } from './QRCode.tsx';
import { CheckIcon, CopyIcon, DownloadIcon, PrinterIcon } from './Icons.tsx';
import { buttonClass, hintClass, iconButtonClass, inputClass, labelClass } from './ui.ts';
import { usePanelColors } from './effects.tsx';
import GlareHover from './reactbits/GlareHover.tsx';

export const getStoreUrl = (userId: string | undefined) =>
    `${window.location.origin}${window.location.pathname}#/store/${userId}`;

// margin 4 keeps the standard quiet zone so the printed code scans reliably
export const toPrintableDataUrl = (url: string) => QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024, margin: 4 });

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Link to the store for one table: orders sent from it say which table they come from
export const getTableUrl = (userId: string | undefined, table: number) => `${getStoreUrl(userId)}?mesa=${table}`;

export const MAX_TABLES = 100;

// Prints an HTML document from a hidden iframe, so the panel itself is not printed
const printHtml = (html: string) => {
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

// Prints a page with the business name and the QR
export const printQR = (dataUrl: string, businessName: string) => printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Código QR</title><style>
        @page { margin: 20mm; }
        body { margin: 0; font-family: system-ui, sans-serif; text-align: center; color: #18181b; }
        h1 { margin: 0 0 8mm; font-size: 28pt; }
        img { width: 120mm; height: 120mm; }
        p { margin: 6mm 0 0; font-size: 14pt; color: #52525b; }
    </style></head><body>
        ${businessName ? `<h1>${escapeHtml(businessName)}</h1>` : ''}
        <img src="${dataUrl}" alt="">
        <p>Escanea el código para ver la carta</p>
    </body></html>`);

// Prints one card per table, four per A4 page, with dashed borders to cut them out
export const printTableQRs = (tables: { table: number; dataUrl: string }[], businessName: string, caption: string) => printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>QR por mesa</title><style>
        @page { size: A4; margin: 10mm; }
        body { margin: 0; font-family: system-ui, sans-serif; color: #18181b; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; }
        .card { box-sizing: border-box; height: 138mm; padding: 8mm; border: 1px dashed #a1a1aa; margin: -0.5px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; break-inside: avoid; }
        .name { margin: 0; font-size: 13pt; font-weight: 600; color: #52525b; }
        .table { margin: 2mm 0 4mm; font-size: 30pt; font-weight: 800; }
        img { width: 70mm; height: 70mm; }
        .caption { margin: 4mm 0 0; font-size: 11pt; color: #52525b; }
    </style></head><body><div class="grid">
        ${tables.map(({ table, dataUrl }) => `<div class="card">
            ${businessName ? `<p class="name">${escapeHtml(businessName)}</p>` : ''}
            <p class="table">Mesa ${table}</p>
            <img src="${dataUrl}" alt="">
            <p class="caption">${escapeHtml(caption)}</p>
        </div>`).join('')}
    </div></body></html>`);

const StoreQRModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const { primary } = usePanelColors();
    const [businessName, setBusinessName] = useState('');
    const [ordersEnabled, setOrdersEnabled] = useState(false);
    const [copied, setCopied] = useState(false);
    const [tableCount, setTableCount] = useState('10');
    const [printingTables, setPrintingTables] = useState(false);
    const storeUrl = getStoreUrl(user?.id);
    const tables = Math.floor(Number(tableCount));
    const validTables = Number.isFinite(tables) && tables >= 1 && tables <= MAX_TABLES;

    useEffect(() => {
        supabaseService.getProfile().then(profile => {
            setBusinessName(profile?.business_name ?? '');
            setOrdersEnabled(profile?.orders_enabled === true);
        });
    }, []);

    const handlePrintTables = async () => {
        if (!validTables) return;
        setPrintingTables(true);
        try {
            const codes = await Promise.all(
                Array.from({ length: tables }, (_, i) => i + 1).map(async table => ({
                    table,
                    dataUrl: await QRCode.toDataURL(getTableUrl(user?.id, table), { ...QR_OPTIONS, width: 600, margin: 4 }),
                })),
            );
            printTableQRs(codes, businessName, ordersEnabled ? 'Escanea para ver la carta y hacer tu pedido' : 'Escanea para ver la carta');
        } catch (error) {
            console.error('Error generating table QR codes:', error);
        } finally {
            setPrintingTables(false);
        }
    };

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
                    {/* Sweeps once when the dialog opens, then on hover */}
                    <GlareHover background="#FFFFFF" borderColor="rgb(var(--line))" borderRadius="0.75rem" glareColor={primary} glareOpacity={0.35} intro className="p-3">
                        <QRCodeComponent url={storeUrl} size={220} />
                    </GlareHover>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-muted/50 py-1 pl-3 pr-1">
                    <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-fg-muted hover:text-fg" title={storeUrl}>
                        {storeUrl.replace(/^https?:\/\//, '')}
                    </a>
                    <button type="button" onClick={handleCopyUrl} className={iconButtonClass} title={copied ? 'Copiado' : 'Copiar enlace'} aria-label="Copiar enlace">
                        {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                    </button>
                </div>

                <div className="mt-5 space-y-2 border-t border-line pt-5">
                    <p className="text-sm font-medium text-fg">QR por mesa</p>
                    <p className={hintClass}>
                        Un código para cada mesa, cuatro por hoja para recortar.{' '}
                        {ordersEnabled ? 'Los pedidos que lleguen desde una mesa dirán su número.' : 'Si activas los pedidos por WhatsApp, cada pedido dirá de qué mesa viene.'}
                    </p>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label htmlFor="table-count" className={labelClass}>Cantidad de mesas</label>
                            <input id="table-count" type="number" inputMode="numeric" min={1} max={MAX_TABLES} value={tableCount} onChange={(e) => setTableCount(e.target.value)} className={`${inputClass} mt-1.5`} />
                        </div>
                        <button type="button" onClick={handlePrintTables} disabled={!validTables || printingTables} className={buttonClass('secondary')}>
                            <PrinterIcon />
                            {printingTables ? 'Generando...' : 'Imprimir'}
                        </button>
                    </div>
                    {!validTables && tableCount !== '' && <p className="text-xs text-danger">Entre 1 y {MAX_TABLES} mesas.</p>}
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
