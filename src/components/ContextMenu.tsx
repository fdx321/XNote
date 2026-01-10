import React, { useEffect, useRef } from 'react';
import { Copy, FolderPlus, Trash2, FilePlus, FolderInput, Edit2 } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    target: { path: string; isDir: boolean };
    type: 'root' | 'folder' | 'file';
    onClose: () => void;
    onDelete: () => void;
    onNewGroup?: () => void;
    onDuplicate?: () => void;
    onNewNote?: () => void;
    onMoveTo?: () => void;
    onRename?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = (props) => {
    const { x, y, target, type, onClose, onDelete, onNewGroup, onDuplicate, onNewNote, onMoveTo, onRename } = props;
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Adjust position if menu goes off screen
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    return (
        <div 
            ref={menuRef}
            className="fixed z-50 w-48 bg-surface border border-border rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100"
            style={style}
        >
            <div className="px-3 py-2 border-b border-border text-xs text-muted font-medium truncate">
                {type === 'root' ? "Workspace" : target.path.split('/').pop()}
            </div>
            
            {onNewNote && (
                <button 
                    onClick={() => { onNewNote(); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center"
                >
                    <FilePlus size={14} className="mr-2" /> New Note
                </button>
            )}

            {onNewGroup && (
                <button 
                    onClick={() => { onNewGroup(); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center"
                >
                    <FolderPlus size={14} className="mr-2" /> {type === 'root' ? "New Folder" : "New Group"}
                </button>
            )}
            
            {onDuplicate && !target.isDir && (
                <button 
                    onClick={() => { onDuplicate(); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center"
                >
                    <Copy size={14} className="mr-2" /> Duplicate
                </button>
            )}

            {onMoveTo && (
                <button 
                    onClick={() => { onMoveTo(); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center"
                >
                    <FolderInput size={14} className="mr-2" /> Move To...
                </button>
            )}

            {onRename && (
                <button 
                    onClick={() => { onRename(); onClose(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center"
                >
                    <Edit2 size={14} className="mr-2" /> Rename
                </button>
            )}

            {type !== 'root' && (
                <>
                    <div className="h-px bg-border my-1" />
                    <button 
                        onClick={() => { console.log('Delete clicked'); onDelete(); onClose(); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surfaceHighlight flex items-center text-error hover:text-red-400"
                    >
                        <Trash2 size={14} className="mr-2" /> Delete
                    </button>
                </>
            )}
        </div>
    );
};
