import React from 'react';
import { Github, Command, Folder, FileText } from 'lucide-react';
import { useAppStore, FileNode } from '../store';
import { clsx } from 'clsx';

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
    const { currentPath, files, setSelectedFile, viewPath, setViewPath } = useAppStore();

    if (!currentPath) {
        return <WelcomeScreen />;
    }

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

    const activePath = viewPath || currentPath;
    const activeNode = activePath === currentPath ? { name: 'Workspace', children: files } : findNodeByPath(files, activePath);
    const displayFiles = activeNode?.children || (activePath === currentPath ? files : []);

    const handleNavigate = (node: FileNode) => {
        if (node.is_dir) {
            setViewPath(node.path as string);
        } else {
            setSelectedFile(node);
        }
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
                        // Go up one level
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
            </div>

            {displayFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-muted">
                    <Folder size={48} className="mb-4 opacity-20" />
                    <p>Empty folder</p>
                </div>
            )}
        </div>
    );
};
