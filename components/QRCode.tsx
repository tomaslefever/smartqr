import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeProps {
    url: string;
    // Width in px of the rendered code
    size?: number;
}

export const QR_OPTIONS = {
    errorCorrectionLevel: 'H',
    color: {
        dark: '#3D3D3D',
        light: '#ffffff',
    },
} as const;

const QRCodeComponent: React.FC<QRCodeProps> = ({ url, size = 160 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, url, { ...QR_OPTIONS, width: size, margin: 0 }).catch((error) => {
                console.error('Error generating QR code:', error);
            });
        }
    }, [url, size]);

    // Always dark on white so it scans in any color mode; the caller provides the frame
    return <canvas ref={canvasRef} className="block" />;
};

export default QRCodeComponent;
