import React, { useMemo, useState } from 'react';
import { Github, Command, Folder, FileText, FolderPlus, FilePlus } from 'lucide-react';
import { useAppStore, FileNode } from '../store';
import { clsx } from 'clsx';
import { InputModal } from './InputModal';
import { invoke } from '@tauri-apps/api/core';
import { getDepthFromRootPath } from '../utils/path';

const WelcomeScreen = () => (
    <div className="flex-1 h-full flex flex-col items-center justify-center bg-background text-text p-8 animate-in fade-in duration-500">
        <div className="max-w-md w-full text-center">
            <div className="mb-12">
                <h1 className="text-6xl font-bold tracking-tighter mb-4 bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                    XNote
                </h1>
                <p className="text-muted text-xl">High Performance Markdown Editor</p>
            </div>

            <div className="text-left bg-surface rounded-lg p-6 border border-border shadow-2xl">
                <h3 className="text-sm font-semibold text-muted mb-4 uppercase tracking-wider">Shortcuts</h3>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-text/80">New Note</span>
                        <kbd className="bg-surfaceHighlight px-2 py-1 rounded text-xs border border-border flex items-center font-mono text-muted"><Command size={10} className="mr-1"/> N</kbd>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-text/80">Search</span>
                        <kbd className="bg-surfaceHighlight px-2 py-1 rounded text-xs border border-border flex items-center font-mono text-muted"><Command size={10} className="mr-1"/> P</kbd>
                    </div>
                        <div className="flex justify-between items-center">
                        <span className="text-text/80">Split View</span>
                        <kbd className="bg-surfaceHighlight px-2 py-1 rounded text-xs border border-border flex items-center font-mono text-muted"><Command size={10} className="mr-1"/> \</kbd>
                    </div>
                </div>
            </div>

            <div className="mt-12 flex justify-center space-x-4 text-muted">
                <a href="#" className="hover:text-text transition-colors opacity-50 hover:opacity-100"><Github size={24} /></a>
            </div>
        </div>
    </div>
);

export const Dashboard: React.FC = () => {
    const { currentPath, files, setSelectedFile, viewPath, setViewPath, loadFiles, pushNotice } = useAppStore();
    const [newGroupOpen, setNewGroupOpen] = useState(false);
    const [newNoteOpen, setNewNoteOpen] = useState(false);

    if (!currentPath) {
        return <WelcomeScreen />;
    }

    const activePath = viewPath || currentPath;

    const activeNode = useMemo(() => {
        const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
            for (const node of nodes) {
                if (node.path === path) return node;
                if (node.children) {
                    const found = findNodeByPath(node.children, path);
                    if (found) return found;
                }
            }
            return null;
        };

        return activePath === currentPath ? ({ name: 'Workspace', children: files } as any) : findNodeByPath(files, activePath);
    }, [activePath, currentPath, files]);

    const displayFiles = activeNode?.children || (activePath === currentPath ? files : []);

    const handleNavigate = (node: FileNode) => {
        if (node.is_dir) {
            setViewPath(node.path as string);
        } else {
            setSelectedFile(node);
        }
    };

    const createNoteInPath = async (dirPath: string, name: string) => {
        const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;
        if (isMock) {
            if (currentPath === '/mock') {
                const { mockFs } = await import('../utils/fs-adapter');
                await mockFs.createFile(`${dirPath}/${name}`);
            }
            return;
        }
        await invoke('create_note', { dirPath, filename: name });
    };

    const createGroupInPath = async (parentPath: string, name: string) => {
        const depth = getDepthFromRootPath(currentPath, String(parentPath));
        if (depth !== null && depth >= 2) {
            pushNotice("二级目录下不允许新建文件夹", "info");
            return;
        }
        const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;
        if (isMock) {
            if (currentPath === '/mock') {
                const { mockFs } = await import('../utils/fs-adapter');
                await mockFs.createDir(`${parentPath}/${name}`);
            }
            return;
        }
        await invoke('create_folder', { parentPath, name });
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-background p-8 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold mb-6 text-text flex items-center">
                <Folder className="mr-3 text-accent" />
                {activeNode?.name || 'Workspace'}
            </h2>
            
            {activePath !== currentPath && (
                <div 
                    className="mb-4 text-sm text-muted hover:text-text cursor-pointer flex items-center w-fit"
                    onClick={() => {
                        const parentPath = activePath.substring(0, activePath.lastIndexOf('/'));
                        setViewPath(parentPath === currentPath ? null : parentPath);
                    }}
                >
                    &larr; Back
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {displayFiles.map((node: FileNode) => (
                    <div 
                        key={node.path as string}
                        onClick={() => handleNavigate(node)}
                        className={clsx(
                            "aspect-square bg-surface border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-surfaceHighlight hover:scale-105 hover:shadow-lg group",
                            !node.is_dir && "hover:border-accent/50"
                        )}
                    >
                        {node.is_dir ? (
                            <Folder size={48} className="text-accent mb-3 group-hover:text-accent/80 transition-colors" />
                        ) : (
                            <FileText size={48} className="text-muted mb-3 group-hover:text-text transition-colors" />
                        )}
                        <span className="text-sm font-medium text-text/90 line-clamp-2 break-all">
                            {node.name}
                        </span>
                        {node.is_dir && (
                            <span className="text-xs text-muted mt-1">
                                {node.children?.length || 0} items
                            </span>
                        )}
                    </div>
                ))}

                <div
                    key="__create_group__"
                    onClick={() => setNewGroupOpen(true)}
                    className={clsx(
                        "aspect-square bg-surface border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-surfaceHighlight hover:scale-105 hover:shadow-lg group"
                    )}
                >
                    <FolderPlus size={48} className="text-accent mb-3 group-hover:text-accent/80 transition-colors" />
                    <span className="text-sm font-medium text-text/90 line-clamp-2 break-all">
                        New Group
                    </span>
                </div>

                <div
                    key="__create_note__"
                    onClick={() => setNewNoteOpen(true)}
                    className={clsx(
                        "aspect-square bg-surface border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-surfaceHighlight hover:scale-105 hover:shadow-lg group hover:border-accent/50"
                    )}
                >
                    <FilePlus size={48} className="text-muted mb-3 group-hover:text-text transition-colors" />
                    <span className="text-sm font-medium text-text/90 line-clamp-2 break-all">
                        New Note
                    </span>
                </div>
            </div>

            <InputModal
                isOpen={newGroupOpen}
                title="Enter group name"
                placeholder="Group"
                onClose={() => setNewGroupOpen(false)}
                onSubmit={async (name) => {
                    try {
                        await createGroupInPath(activePath, name);
                        await loadFiles(currentPath);
                    } catch (err) {
                        alert("Error creating group: " + String(err));
                    }
                }}
            />

            <InputModal
                isOpen={newNoteOpen}
                title="Enter note name"
                placeholder="Note.md"
                onClose={() => setNewNoteOpen(false)}
                onSubmit={async (name) => {
                    try {
                        await createNoteInPath(activePath, name);
                        await loadFiles(currentPath);
                    } catch (err) {
                        const errMsg = String(err);
                        if (errMsg.includes("PERMISSION_DENIED")) {
                            alert("Permission Denied: Cannot create note. Please check your system settings.");
                        } else {
                            alert(errMsg);
                        }
                    }
                }}
            />
        </div>
    );
};
