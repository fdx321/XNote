import React, { useState } from 'react';
import { FileNode } from '../store';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

interface MoveToModalProps {
    isOpen: boolean;
    files: FileNode[];
    currentPath: string; // The root path of workspace
    sourceNode: FileNode | null;
    onClose: () => void;
    onMove: (targetPath: string) => void;
}

export const MoveToModal: React.FC<MoveToModalProps> = ({ isOpen, files, currentPath, sourceNode, onClose, onMove }) => {
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    if (!isOpen || !sourceNode) return null;

    const toggleExpand = (path: string) => {
        setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const renderFolderTree = (nodes: FileNode[], level = 0) => {
        return nodes.filter(n => n.is_dir).map(node => {
            // Prevent moving into itself or its children
            const isDescendant = node.path.startsWith(sourceNode.path as string);
            const isSelf = node.path === sourceNode.path;
            const isDisabled = isDescendant || isSelf;

            return (
                <React.Fragment key={node.path as string}>
                    <div 
                        className={clsx(
                            "flex items-center px-2 py-1.5 cursor-pointer text-sm select-none hover:bg-surfaceHighlight transition-colors rounded mb-0.5",
                            selectedTarget === node.path && "bg-surfaceHighlight text-accent",
                            isDisabled && "opacity-50 cursor-not-allowed"
                        )}
                        style={{ paddingLeft: level * 16 + 8 }}
                        onClick={() => !isDisabled && setSelectedTarget(node.path as string)}
                    >
                        <span 
                            className="mr-1 opacity-70" 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                toggleExpand(node.path as string); 
                            }}
                        >
                            {node.children && node.children.some(c => c.is_dir) ? (
                                expanded[node.path as string] ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            ) : <div className="w-[14px]" />}
                        </span>
                        <Folder size={14} className={clsx("mr-2", selectedTarget === node.path ? "text-accent" : "text-muted")} />
                        <span className="truncate">{node.name}</span>
                    </div>
                    {expanded[node.path as string] && node.children && renderFolderTree(node.children, level + 1)}
                </React.Fragment>
            );
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
            <div className="bg-surface border border-border rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-text">Move "{sourceNode.name}" to...</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {/* Root Option */}
                    <div 
                        className={clsx(
                            "flex items-center px-2 py-1.5 cursor-pointer text-sm select-none hover:bg-surfaceHighlight transition-colors rounded mb-0.5",
                            selectedTarget === currentPath && "bg-surfaceHighlight text-accent"
                        )}
                        onClick={() => setSelectedTarget(currentPath)}
                    >
                         <Folder size={14} className={clsx("mr-2", selectedTarget === currentPath ? "text-accent" : "text-muted")} />
                         <span className="font-medium">Workspace Root</span>
                    </div>

                    <div className="h-px bg-border my-2 mx-2" />

                    {renderFolderTree(files)}
                </div>

                <div className="p-4 border-t border-border flex justify-end space-x-2">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm text-muted hover:text-text hover:bg-surfaceHighlight rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={!selectedTarget}
                        onClick={() => selectedTarget && onMove(selectedTarget)}
                        className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Move
                    </button>
                </div>
            </div>
        </div>
    );
};
