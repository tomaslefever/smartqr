import React from 'react';
import { CloseIcon } from './Icons.tsx';

interface ReportModalProps {
    content: string;
    onClose: () => void;
}

const ReportModal: React.FC<ReportModalProps> = ({ content, onClose }) => {
    // A simple function to render markdown-like content to basic HTML
    const renderContent = (text: string) => {
        return text
            .split('\n')
            .map((line, index) => {
                if (line.startsWith('# ')) return <h1 key={index} className="text-2xl font-bold mb-4 text-brand-text">{line.substring(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={index} className="text-xl font-semibold mt-4 mb-2 text-brand-text">{line.substring(3)}</h2>;
                if (line.startsWith('### ')) return <h3 key={index} className="text-lg font-semibold mt-3 mb-1 text-brand-text">{line.substring(4)}</h3>;
                if (line.startsWith('- ')) return <li key={index} className="ml-6 list-disc">{line.substring(2)}</li>;
                if (line.trim() === '---') return <hr key={index} className="my-4" />;
                if (line.trim() === '') return <div key={index} className="h-4" />;
                return <p key={index} className="my-1 text-gray-700">{line}</p>;
            });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-brand-text">Informe del Asistente</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100 transition-colors">
                       <CloseIcon />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {renderContent(content)}
                </div>
                <div className="p-4 bg-gray-50 flex justify-end space-x-4 border-t rounded-b-lg">
                    <button type="button" onClick={onClose} className="bg-brand-primary text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportModal;
