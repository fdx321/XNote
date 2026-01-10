import React, { useState, useEffect, useRef } from 'react';

interface InputModalProps {
    isOpen: boolean;
    title: string;
    defaultValue?: string;
    placeholder?: string;
    onClose: () => void;
    onSubmit: (value: string) => void;
}

export const InputModal: React.FC<InputModalProps> = ({ 
    isOpen, 
    title, 
    defaultValue = '', 
    placeholder = '', 
    onClose, 
    onSubmit 
}) => {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            // Focus input on open
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (value.trim()) {
            onSubmit(value.trim());
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
            <div className="bg-surface border border-border rounded-lg shadow-xl w-80 p-4 transform transition-all scale-100">
                <h3 className="text-lg font-semibold mb-4 text-text">{title}</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full bg-background border border-border rounded px-3 py-2 text-text focus:outline-none focus:border-accent mb-4"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                    <div className="flex justify-end space-x-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm text-muted hover:text-text hover:bg-surfaceHighlight rounded transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-blue-600 transition-colors"
                        >
                            Confirm
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
