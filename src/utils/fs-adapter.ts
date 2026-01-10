import { FileNode } from '../store';

export interface FileSystemAdapter {
    readDir(path: string): Promise<FileNode[]>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    createDir(path: string): Promise<string>;
    createFile(path: string): Promise<string>;
    deleteFile(path: string): Promise<void>;
    moveFile(source: string, target: string): Promise<void>;
    copyFile(source: string, target: string): Promise<void>;
    saveImage(base64: string, dir: string): Promise<string>;
}

// Mock Data for Browser Mode
const MOCK_FILES: FileNode[] = [
    {
        name: 'Welcome',
        path: '/mock/Welcome',
        is_dir: true,
        children: [
            {
                name: 'Intro.md',
                path: '/mock/Welcome/Intro.md',
                is_dir: false,
                last_modified: '2024-01-01 12:00'
            },
            {
                name: 'Features.md',
                path: '/mock/Welcome/Features.md',
                is_dir: false,
                last_modified: '2024-01-01 12:05'
            }
        ]
    },
    {
        name: 'Projects',
        path: '/mock/Projects',
        is_dir: true,
        children: []
    },
    {
        name: 'todo.md',
        path: '/mock/todo.md',
        is_dir: false,
        last_modified: '2024-01-02 09:30'
    }
];

const MOCK_CONTENT: Record<string, string> = {
    '/mock/Welcome/Intro.md': '# Welcome to XNote\n\nThis is a high-performance markdown editor.\n\n## Getting Started\nSelect a file from the sidebar to start editing.',
    '/mock/Welcome/Features.md': '# Features\n\n- Fast\n- Secure\n- Local-first',
    '/mock/todo.md': '# Todo List\n\n- [x] Fix bugs\n- [ ] Add features'
};

class BrowserMockAdapter implements FileSystemAdapter {
    async readDir(path: string): Promise<FileNode[]> {
        console.log(`[Mock] Reading directory: ${path}`);
        return new Promise(resolve => setTimeout(() => resolve(MOCK_FILES), 300));
    }

    async readFile(path: string): Promise<string> {
        console.log(`[Mock] Reading file: ${path}`);
        return new Promise(resolve => setTimeout(() => resolve(MOCK_CONTENT[path] || ''), 200));
    }

    async writeFile(path: string, content: string): Promise<void> {
        console.log(`[Mock] Writing file: ${path}`);
        MOCK_CONTENT[path] = content;
        return Promise.resolve();
    }

    async createDir(path: string): Promise<string> {
        console.log(`[Mock] Creating dir: ${path}`);
        // Add to MOCK_FILES
        const name = path.split('/').pop() || 'New Folder';
        // For simplicity in mock, we just add to root or try to find parent
        // Since this is mock, we assume flat structure or 1-level deep for demo
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        
        const newNode: FileNode = {
            name,
            path,
            is_dir: true,
            children: []
        };

        if (parentPath === '/mock') {
            MOCK_FILES.push(newNode);
        } else {
             // Try to find parent
             const parent = MOCK_FILES.find(f => f.path === parentPath);
             if (parent && parent.children) {
                 parent.children.push(newNode);
             } else {
                 MOCK_FILES.push(newNode); // Fallback to root
             }
        }
        return Promise.resolve(path);
    }

    async createFile(path: string): Promise<string> {
        console.log(`[Mock] Creating file: ${path}`);
        const name = path.split('/').pop() || 'New Note.md';
        const parentPath = path.substring(0, path.lastIndexOf('/'));

        const newNode: FileNode = {
            name,
            path,
            is_dir: false,
            last_modified: new Date().toLocaleString()
        };

        MOCK_CONTENT[path] = '';

         if (parentPath === '/mock') {
            MOCK_FILES.push(newNode);
        } else {
             // Try to find parent
             const parent = MOCK_FILES.find(f => f.path === parentPath);
             if (parent && parent.children) {
                 parent.children.push(newNode);
             } else {
                 MOCK_FILES.push(newNode); // Fallback
             }
        }

        return Promise.resolve(path);
    }

    async deleteFile(path: string): Promise<void> {
        console.log(`[Mock] Deleting: ${path}`);
        
        // Helper to remove from tree
        const removeNode = (nodes: FileNode[], targetPath: string): boolean => {
            const index = nodes.findIndex(n => n.path === targetPath);
            if (index !== -1) {
                nodes.splice(index, 1);
                return true;
            }
            for (const node of nodes) {
                if (node.children) {
                    if (removeNode(node.children, targetPath)) return true;
                }
            }
            return false;
        };

        removeNode(MOCK_FILES, path);
        delete MOCK_CONTENT[path];
        return Promise.resolve();
    }

    async moveFile(source: string, target: string): Promise<void> {
        console.log(`[Mock] Moving: ${source} -> ${target}`);
        
        // 1. Find the node
        const findNode = (nodes: FileNode[], p: string): { node: FileNode, parent: FileNode | null, index: number } | null => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].path === p) return { node: nodes[i], parent: null, index: i }; // Root level match
                if (nodes[i].children) {
                    const found = findNode(nodes[i].children!, p);
                    if (found) {
                        if (found.parent === null) found.parent = nodes[i];
                        return found;
                    }
                }
            }
            return null;
        };

        const sourceInfo = findNode(MOCK_FILES, source);
        if (!sourceInfo) return Promise.reject("Source not found");

        // 2. Remove from old location
        if (sourceInfo.parent) {
            sourceInfo.parent.children!.splice(sourceInfo.index, 1);
        } else {
            MOCK_FILES.splice(sourceInfo.index, 1);
        }

        // 3. Update path recursively
        const updatePath = (node: FileNode, newPath: string) => {
            const oldPath = node.path as string;
            node.path = newPath;
            if (MOCK_CONTENT[oldPath] !== undefined) {
                MOCK_CONTENT[newPath] = MOCK_CONTENT[oldPath];
                delete MOCK_CONTENT[oldPath];
            }
            if (node.children) {
                node.children.forEach(child => {
                    const childName = child.path.split('/').pop();
                    updatePath(child, `${newPath}/${childName}`);
                });
            }
        };
        updatePath(sourceInfo.node, target);

        // 4. Add to new location
        const targetDir = target.substring(0, target.lastIndexOf('/'));
        // Special case: if targetDir is same as current root mock path prefix, add to root
        // But here we assume target is full path.
        
        // We need to find the parent folder of the target path
        // e.g. move /a/b -> /c/b. target is /c/b. targetDir is /c.
        
        if (targetDir === '/mock') {
            MOCK_FILES.push(sourceInfo.node);
        } else {
            const parentInfo = findNode(MOCK_FILES, targetDir);
            if (parentInfo && parentInfo.node.children) {
                parentInfo.node.children.push(sourceInfo.node);
            } else {
                 // Fallback to root if parent not found (should not happen in valid move)
                 MOCK_FILES.push(sourceInfo.node);
            }
        }

        return Promise.resolve();
    }

    async copyFile(source: string, target: string): Promise<void> {
        console.log(`[Mock] Copying: ${source} -> ${target}`);
        
        // 1. Find source
        const findNode = (nodes: FileNode[], p: string): FileNode | null => {
            for (const node of nodes) {
                if (node.path === p) return node;
                if (node.children) {
                    const found = findNode(node.children, p);
                    if (found) return found;
                }
            }
            return null;
        };

        const sourceNode = findNode(MOCK_FILES, source);
        if (!sourceNode) return Promise.reject("Source not found");

        // 2. Clone node (deep copy)
        const cloneNode = (node: FileNode, newPath: string): FileNode => {
            const newNode: FileNode = {
                ...node,
                path: newPath,
                name: newPath.split('/').pop() || 'copy',
                children: node.children ? [] : undefined
            };

            if (MOCK_CONTENT[node.path as string] !== undefined) {
                MOCK_CONTENT[newPath] = MOCK_CONTENT[node.path as string];
            }

            if (node.children) {
                newNode.children = node.children.map(child => {
                    const childName = child.path.split('/').pop();
                    return cloneNode(child, `${newPath}/${childName}`);
                });
            }
            return newNode;
        };

        const newNode = cloneNode(sourceNode, target);

        // 3. Add to parent
        const targetDir = target.substring(0, target.lastIndexOf('/'));
        if (targetDir === '/mock') {
            MOCK_FILES.push(newNode);
        } else {
            const parentNode = findNode(MOCK_FILES, targetDir);
            if (parentNode && parentNode.children) {
                parentNode.children.push(newNode);
            } else {
                MOCK_FILES.push(newNode);
            }
        }

        return Promise.resolve();
    }
    
    async saveImage(_base64: string, _dir: string): Promise<string> {
        console.log(`[Mock] Saving image`);
        return Promise.resolve("mock_image.png");
    }

    async searchText(query: string): Promise<Array<{ path: string; name: string; line: number; preview: string }>> {
        const q = query.trim().toLowerCase();
        if (!q) return [];

        const results: Array<{ path: string; name: string; line: number; preview: string }> = [];
        for (const [path, content] of Object.entries(MOCK_CONTENT)) {
            if (!path.endsWith('.md') && !path.endsWith('.txt')) continue;
            const lines = String(content).split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(q)) {
                    results.push({
                        path,
                        name: path.split('/').pop() || path,
                        line: i + 1,
                        preview: lines[i]
                    });
                    if (results.length >= 50) return results;
                }
            }
        }
        return results;
    }
}

// Tauri Implementation will be invoked directly in store/components for now, 
// or we can wrap it here too. For simplicity, we just provide the Mock one 
// to be used when Tauri is not available.

export const mockFs = new BrowserMockAdapter();
