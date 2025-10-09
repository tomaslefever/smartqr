
import React, { useEffect, useRef } from 'react';

declare var QRCode: any;

interface QRCodeProps {
    url: string;
}

const QRCodeComponent: React.FC<QRCodeProps> = ({ url }) => {
    const qrCodeRef = useRef<HTMLDivElement>(null);
    const qrCodeInstance = useRef<any>(null);

    useEffect(() => {
        if (qrCodeRef.current) {
            // Clear previous QR code if URL changes
            if (qrCodeInstance.current) {
                qrCodeInstance.current.clear();
                qrCodeInstance.current.makeCode(url);
            } else {
                 qrCodeInstance.current = new QRCode(qrCodeRef.current, {
                    text: url,
                    width: 160,
                    height: 160,
                    colorDark: "#3D3D3D",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        }
        
        // Cleanup on unmount
        return () => {
            if (qrCodeInstance.current) {
                qrCodeInstance.current.clear();
            }
        };
    }, [url]);

    return <div ref={qrCodeRef} className="p-2 bg-white inline-block rounded-lg shadow-inner"/>;
};

export default QRCodeComponent;
