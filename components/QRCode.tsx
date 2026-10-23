import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeProps {
    url: string;
}

export const QR_OPTIONS = {
    errorCorrectionLevel: 'H',
    color: {
        dark: '#3D3D3D',
        light: '#ffffff',
    },
} as const;

const QRCodeComponent: React.FC<QRCodeProps> = ({ url }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, url, { ...QR_OPTIONS, width: 160, margin: 0 }).catch((error) => {
                console.error('Error generating QR code:', error);
            });
        }
    }, [url]);

    return (
        <div className="p-2 bg-white inline-block rounded-lg shadow-inner">
            <canvas ref={canvasRef} />
        </div>
    );
};

export default QRCodeComponent;
